import twilio from 'twilio';
import nodemailer from 'nodemailer';
import { prisma } from '../index';
import { io } from '../index';

// Initialize Twilio
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// Initialize email transporter
const emailTransporter = nodemailer.createTransport({
  host: 'smtp.resend.com',
  port: 465,
  secure: true,
  auth: {
    user: 'resend',
    pass: process.env.RESEND_API_KEY,
  },
});

export class NotificationService {
  
  /**
   * Send SMS notification to staff about available shift
   */
  static async sendSMS(
    recipientId: string,
    sickCallId: string,
    message: string
  ): Promise<string | null> {
    
    try {
      // Get recipient details
      const recipient = await prisma.user.findUnique({
        where: { id: recipientId },
      });
      
      if (!recipient || !recipient.phone) {
        throw new Error('Recipient not found or has no phone number');
      }
      
      // Create notification record
      const notification = await prisma.notification.create({
        data: {
          sickCallId,
          recipientId,
          type: 'SMS',
          status: 'PENDING',
          message,
        },
      });
      
      // Send SMS if Twilio is configured
      if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
        const smsResult = await twilioClient.messages.create({
          body: message,
          to: recipient.phone,
          from: process.env.TWILIO_PHONE_NUMBER,
        });
        
        // Update notification with delivery info
        await prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            externalId: smsResult.sid,
          },
        });
        
        // Emit real-time update
        io.to(`org-${recipient.organizationId}`).emit('notification-sent', {
          notificationId: notification.id,
          recipientId,
          sickCallId,
          status: 'SENT',
        });
        
        console.log(`✅ SMS sent to ${recipient.firstName} ${recipient.lastName}: ${smsResult.sid}`);
        return notification.id;
        
      } else {
        // Mock mode for development without Twilio
        console.log(`📱 [MOCK SMS] To: ${recipient.phone}`);
        console.log(`   Message: ${message}`);
        
        await prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            externalId: 'mock-' + Date.now(),
          },
        });
        
        // Emit real-time update
        io.to(`org-${recipient.organizationId}`).emit('notification-sent', {
          notificationId: notification.id,
          recipientId,
          sickCallId,
          status: 'SENT',
        });
        
        return notification.id;
      }
      
    } catch (error) {
      console.error('❌ SMS sending failed:', error);
      
      // Update notification status to failed
      await prisma.notification.updateMany({
        where: {
          sickCallId,
          recipientId,
          status: 'PENDING',
        },
        data: {
          status: 'FAILED',
        },
      });
      
      return null;
    }
  }
  
  /**
   * Send email notification
   */
  static async sendEmail(
    recipientId: string,
    subject: string,
    htmlContent: string,
    sickCallId?: string
  ): Promise<boolean> {
    
    try {
      const recipient = await prisma.user.findUnique({
        where: { id: recipientId },
      });
      
      if (!recipient) {
        throw new Error('Recipient not found');
      }
      
      // Create notification record if sickCallId provided
      let notification;
      if (sickCallId) {
        notification = await prisma.notification.create({
          data: {
            sickCallId,
            recipientId,
            type: 'EMAIL',
            status: 'PENDING',
            message: subject,
          },
        });
      }
      
      // Send email
      const info = await emailTransporter.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@smartshift.app',
        to: recipient.email,
        subject,
        html: htmlContent,
      });
      
      // Update notification status
      if (notification) {
        await prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            externalId: info.messageId,
          },
        });
      }
      
      console.log(`✅ Email sent to ${recipient.email}: ${info.messageId}`);
      return true;
      
    } catch (error) {
      console.error('❌ Email sending failed:', error);
      return false;
    }
  }
  
  /**
   * Notify multiple candidates sequentially or in batch
   */
  static async notifyCandidates(
    sickCallId: string,
    candidateIds: string[],
    shiftDetails: {
      location: string;
      date: string;
      startTime: string;
      endTime: string;
    },
    mode: 'sequential' | 'batch' = 'sequential'
  ): Promise<void> {
    
    const message = `🚨 SmartShift: A shift is available at ${shiftDetails.location} on ${shiftDetails.date} from ${shiftDetails.startTime} to ${shiftDetails.endTime}. Reply YES to accept or NO to decline.`;
    
    if (mode === 'batch') {
      // Send to all candidates at once
      const promises = candidateIds.map(candidateId => 
        this.sendSMS(candidateId, sickCallId, message)
      );
      await Promise.all(promises);
      
    } else {
      // Sequential - send to first, wait for response or timeout before next
      // This is handled by the queue system in the sick call workflow
      for (const candidateId of candidateIds) {
        await this.sendSMS(candidateId, sickCallId, message);
        // In production, this would be managed by Bull queue with delays
      }
    }
  }
  
  /**
   * Parse SMS response (YES/NO)
   */
  static parseResponse(responseText: string): 'ACCEPT' | 'DECLINE' | null {
    const normalized = responseText.trim().toUpperCase();
    
    if (['YES', 'Y', 'ACCEPT', '1', 'OK'].includes(normalized)) {
      return 'ACCEPT';
    }
    
    if (['NO', 'N', 'DECLINE', '2', 'NOPE'].includes(normalized)) {
      return 'DECLINE';
    }
    
    return null;
  }
}
