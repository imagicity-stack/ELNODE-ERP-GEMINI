import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseFirestoreTimestamp(timestamp: any): Date {
  if (!timestamp) return new Date();
  
  // Firestore Timestamp
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  
  // JS Date
  if (timestamp instanceof Date) {
    return timestamp;
  }
  
  // Seconds/Nanoseconds object (sometimes seen in serialized data)
  if (timestamp.seconds !== undefined) {
    return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
  }
  
  // Number (milliseconds) or String
  const date = new Date(timestamp);
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  return new Date();
}

export function getClassName(classId: string | undefined, classes: any[]) {
  if (!classId) return 'N/A';
  const cls = classes.find(c => c.id === classId || c.name === classId);
  return cls ? cls.name : classId;
}
