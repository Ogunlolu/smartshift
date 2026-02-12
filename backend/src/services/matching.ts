import { prisma } from '../index';
import { MatchedCandidate } from '../shared-types';
import { startOfWeek, endOfWeek, parseISO, differenceInHours } from 'date-fns';

interface MatchingRules {
  prioritizeAvailability: boolean;
  avoidOvertime: boolean;
  useSeniority: boolean;
  useFairness: boolean;
  overtimeThreshold: number; // hours per week
}

const DEFAULT_RULES: MatchingRules = {
  prioritizeAvailability: true,
  avoidOvertime: true,
  useSeniority: true,
  useFairness: true,
  overtimeThreshold: 40,
};

/**
 * The SmartShift Matching Engine
 * 
 * Ranks available staff for shift coverage based on:
 * 1. Availability (not already working, not on another sick call)
 * 2. Overtime avoidance (prioritize staff under 40hrs/week)
 * 3. Seniority (higher seniority = higher rank)
 * 4. Fairness (staff who've picked up fewer shifts recently rank higher)
 */
export class MatchingEngine {
  
  /**
   * Find and rank the best candidates for a shift
   */
  static async findCandidates(
    shiftId: string,
    organizationId: string,
    locationId: string,
    rules?: Partial<MatchingRules>
  ): Promise<MatchedCandidate[]> {
    
    const matchingRules = { ...DEFAULT_RULES, ...rules };
    
    // Get the shift details
    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: { location: true },
    });
    
    if (!shift) {
      throw new Error('Shift not found');
    }
    
    // Get all active staff in this organization
    const allStaff = await prisma.user.findMany({
      where: {
        organizationId,
        role: 'STAFF',
        active: true,
      },
      orderBy: {
        seniority: 'desc',
      },
    });
    
    // Get shifts for the week to calculate hours worked
    const weekStart = startOfWeek(shift.date);
    const weekEnd = endOfWeek(shift.date);
    
    const weeklyShifts = await prisma.shift.findMany({
      where: {
        organizationId,
        date: {
          gte: weekStart,
          lte: weekEnd,
        },
        status: {
          in: ['SCHEDULED', 'COVERED'],
        },
      },
      include: {
        assignedTo: true,
      },
    });
    
    // Get recent shift pickups for fairness calculation (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentPickups = await prisma.shiftResponse.findMany({
      where: {
        responseType: 'ACCEPT',
        createdAt: {
          gte: thirtyDaysAgo,
        },
        sickCall: {
          organizationId,
        },
      },
      include: {
        staff: true,
      },
    });
    
    // Calculate metrics for each staff member
    const candidates: MatchedCandidate[] = [];
    
    for (const staff of allStaff) {
      
      // Check availability - is staff working during this shift?
      const isWorking = weeklyShifts.some(s => 
        s.assignedToId === staff.id &&
        s.date.getTime() === shift.date.getTime() &&
        s.id !== shiftId
      );
      
      if (isWorking && matchingRules.prioritizeAvailability) {
        continue; // Skip unavailable staff
      }
      
      // Calculate hours worked this week
      const hoursThisWeek = weeklyShifts
        .filter(s => s.assignedToId === staff.id)
        .reduce((total, s) => {
          return total + differenceInHours(s.endTime, s.startTime);
        }, 0);
      
      const shiftHours = differenceInHours(shift.endTime, shift.startTime);
      const totalHoursWithShift = hoursThisWeek + shiftHours;
      const willBeOvertime = totalHoursWithShift > matchingRules.overtimeThreshold;
      
      // Count recent pickups for fairness
      const recentPickupCount = recentPickups.filter(p => p.staffId === staff.id).length;
      
      // Calculate score
      let score = 1000; // Base score
      const reasons: string[] = [];
      
      // Factor 1: Availability (highest priority)
      if (!isWorking) {
        score += 500;
        reasons.push('Available');
      } else {
        score -= 1000;
        reasons.push('Already working');
      }
      
      // Factor 2: Overtime avoidance
      if (matchingRules.avoidOvertime) {
        if (!willBeOvertime) {
          score += 300;
          reasons.push('No overtime');
        } else {
          score -= 200;
          reasons.push(`Would be OT (${totalHoursWithShift}hrs)`);
        }
      }
      
      // Factor 3: Seniority
      if (matchingRules.useSeniority && staff.seniority) {
        const seniorityBonus = staff.seniority * 10;
        score += seniorityBonus;
        reasons.push(`Seniority: ${staff.seniority}`);
      }
      
      // Factor 4: Fairness (fewer recent pickups = higher score)
      if (matchingRules.useFairness) {
        const fairnessBonus = Math.max(0, 100 - (recentPickupCount * 20));
        score += fairnessBonus;
        reasons.push(`Recent pickups: ${recentPickupCount}`);
      }
      
      candidates.push({
        userId: staff.id,
        user: {
          id: staff.id,
          email: staff.email,
          firstName: staff.firstName,
          lastName: staff.lastName,
          phone: staff.phone,
          role: staff.role as any,
          active: staff.active,
          seniority: staff.seniority || undefined,
          hireDate: staff.hireDate || undefined,
          organizationId: staff.organizationId,
        },
        score,
        rank: 0, // Will be set after sorting
        reasons,
        isAvailable: !isWorking,
        willBeOvertime,
        hoursWorkedThisWeek: hoursThisWeek,
      });
    }
    
    // Sort by score (descending) and assign ranks
    candidates.sort((a, b) => b.score - a.score);
    candidates.forEach((candidate, index) => {
      candidate.rank = index + 1;
    });
    
    return candidates;
  }
  
  /**
   * Get the top N candidates for notification
   */
  static async getTopCandidates(
    shiftId: string,
    organizationId: string,
    locationId: string,
    count: number = 5,
    rules?: Partial<MatchingRules>
  ): Promise<MatchedCandidate[]> {
    
    const allCandidates = await this.findCandidates(shiftId, organizationId, locationId, rules);
    
    // Filter to only available staff
    const availableCandidates = allCandidates.filter(c => c.isAvailable);
    
    return availableCandidates.slice(0, count);
  }
}
