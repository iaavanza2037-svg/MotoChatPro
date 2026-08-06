/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: 'cliente' | 'moto';
  isOnline: boolean;
  lastActive: number;
  ratingCount?: number;
  ratingSum?: number;
  averageRating?: number;
  zone?: string;
  latitude?: number;
  longitude?: number;
  hasGPS?: boolean;
  firstName?: string;
  lastName?: string;
  phone?: string;
  mototaxiNumber?: string;
}

export interface ChatSession {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  driverId: string;
  driverName: string;
  driverEmail: string;
  status: 'open' | 'closed' | 'transferred';
  lastMessage: string;
  lastMessageTime: number;
  isRated?: boolean;
  clientDeleted?: boolean;
  driverDeleted?: boolean;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: number;
  type: 'text' | 'system';
}

export interface TrafficAlert {
  id: string;
  latitude: number;
  longitude: number;
  reportedBy: string;
  reportedByName: string;
  timestamp: number;
  type?: 'operativo' | 'accidente';
}

