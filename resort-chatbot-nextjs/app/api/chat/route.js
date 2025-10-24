import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

async function getRoomsAvailability() {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('is_available', true)
    .order('price_per_night');
  
  if (error) return null;
  return data;
}

async function getSpaServices() {
  const { data, error } = await supabase
    .from('spa_services')
    .select('*')
    .eq('is_available', true)
    .order('price');
  
  if (error) return null;
  return data;
}

async function getActivities() {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('is_available', true)
    .order('price');
  
  if (error) return null;
  return data;
}

export async function POST(request) {
  try {
    const { message, conversationContext } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { reply: 'API key not configured.' },
        { status: 500 }
      );
    }

    let contextData = '';
    let bookingData = null;
    const lowerMessage = message.toLowerCase();

    const isBookingIntent = lowerMessage.includes('book') || 
                           lowerMessage.includes('reserve') || 
                           lowerMessage.includes('make a reservation');

    if (lowerMessage.includes('room') || lowerMessage.includes('availab') || isBookingIntent) {
      const rooms = await getRoomsAvailability();
      if (rooms && rooms.length > 0) {
        contextData += '\n\nAvailable Rooms:\n';
        rooms.forEach(room => {
          contextData += `- Room ${room.room_number}: ${room.room_type} - $${room.price_per_night}/night (Capacity: ${room.capacity}) - Amenities: ${room.amenities?.join(', ')}\n`;
        });
        
        if (isBookingIntent) {
          contextData += '\n\nTo complete a booking, I need:\n1. Room number (e.g., Room 101)\n2. Check-in date (YYYY-MM-DD)\n3. Check-out date (YYYY-MM-DD)\n4. Number of guests\n5. Guest name\n6. Email address\n7. Phone number';
        }
      }
    }

    if (lowerMessage.includes('spa') || lowerMessage.includes('massage') || lowerMessage.includes('treatment')) {
      const services = await getSpaServices();
      if (services && services.length > 0) {
        contextData += '\n\nSpa Services:\n';
        services.forEach(service => {
          contextData += `- ${service.service_name}: ${service.description} - $${service.price} (${service.duration_minutes} min)\n`;
        });
        
        if (isBookingIntent) {
          contextData += '\n\nTo book a spa service, I need:\n1. Service name\n2. Preferred date (YYYY-MM-DD)\n3. Preferred time (HH:MM in 24h format)\n4. Guest name\n5. Email address\n6. Phone number';
        }
      }
    }

    if (lowerMessage.includes('activit') || lowerMessage.includes('things to do')) {
      const activities = await getActivities();
      if (activities && activities.length > 0) {
        contextData += '\n\nActivities:\n';
        activities.forEach(activity => {
          contextData += `- ${activity.activity_name}: ${activity.description} - $${activity.price || 'Free'} - Schedule: ${activity.schedule}\n`;
        });
      }
    }

    const systemPrompt = `You are a helpful AI assistant for Paradise Resort & Spa. You help guests with bookings, inquiries, and information.

--- CRITICAL ID MAPPING (DO NOT CHANGE) ---
ROOM MAPPING (User Request -> ID):
  * "Room 101" -> ID 1
  * "Room 102" -> ID 2
  * "Room 103" -> ID 3
  * "Room 104" -> ID 4
  * "Room 201" -> ID 5
  * "Room 202" -> ID 6
  * "Room 301" -> ID 7
  
SPA MAPPING (Service Name -> ID):
  * "Swedish Massage" -> ID 1
  * "Deep Tissue Massage" -> ID 2
  * "Hot Stone Therapy" -> ID 3
  * "Aromatherapy" -> ID 4
  * "Facial Treatment" -> ID 5
  * "Couples Massage" -> ID 6

--- ROOM NUMBER TO STRING MAPPING (FOR BOOKINGS) ---
When creating BOOKING_REQUEST, convert room ID to room number string:
  * ID 1 -> "101"
  * ID 2 -> "102"
  * ID 3 -> "103"
  * ID 4 -> "104"
  * ID 5 -> "201"
  * ID 6 -> "202"
  * ID 7 -> "301"

--- AVAILABILITY CHECKING ---
If user asks about availability WITHOUT guest info, create AVAILABILITY_CHECK:
- For rooms: AVAILABILITY_CHECK: {"type":"room","data":{"roomId":1,"checkIn":"2025-12-25","checkOut":"2025-12-27"}}
- For spa: AVAILABILITY_CHECK: {"type":"spa","data":{"serviceId":1,"appointmentDate":"2025-12-25","appointmentTime":"14:00"}}

--- BOOKING CREATION (ALL INFO REQUIRED) ---
When you have ALL information, create BOOKING_REQUEST:

For rooms - USE roomNumber as STRING:
BOOKING_REQUEST: {"type":"room","data":{"roomNumber":"301","checkIn":"2025-12-25","checkOut":"2025-12-27","numGuests":2,"guestName":"John Doe","guestEmail":"john@email.com","guestPhone":"1234567890"}}

For spa - USE serviceId as NUMBER:
BOOKING_REQUEST: {"type":"spa","data":{"serviceId":1,"appointmentDate":"2025-12-25","appointmentTime":"14:00","guestName":"John Doe","guestEmail":"john@email.com","guestPhone":"1234567890"}}

CRITICAL: JSON must be valid. Do NOT show JSON to users. Be conversational.

${contextData}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${systemPrompt}\n\nConversation context: ${conversationContext || 'New conversation'}\n\nUser: ${message}\n\nAssistant:` }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1000,
          }
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API Error:', errorData);
      return NextResponse.json(
        { reply: 'Sorry, I encountered an error. Please try again.' },
        { status: 500 }
      );
    }

    const data = await response.json();
    let reply = data.candidates?.[0]?.content?.parts[0]?.text || 'Sorry, I could not generate a response.';

    // Handle AVAILABILITY_CHECK
    if (reply.includes('AVAILABILITY_CHECK:')) {
      try {
        const startIndex = reply.indexOf('AVAILABILITY_CHECK:') + 'AVAILABILITY_CHECK:'.length;
        let jsonString = reply.substring(startIndex).trim();
        
        let braceCount = 0;
        let endIndex = -1;
        
        for (let i = 0; i < jsonString.length; i++) {
          if (jsonString[i] === '{') braceCount++;
          if (jsonString[i] === '}') braceCount--;
          
          if (braceCount === 0 && jsonString[i] === '}') {
            endIndex = i + 1;
            break;
          }
        }
        
        if (endIndex > 0) {
          jsonString = jsonString.substring(0, endIndex);
        }
        
        console.log('🔍 Checking availability:', jsonString);
        const availabilityRequest = JSON.parse(jsonString);
        
        reply = reply.split('AVAILABILITY_CHECK:')[0].trim();
        
        const protocol = request.headers.get('x-forwarded-proto') || 'http';
        const host = request.headers.get('host') || 'localhost:3000';
        
        const availabilityResponse = await fetch(`${protocol}://${host}/api/check-availability`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(availabilityRequest)
        });

        const availabilityResult = await availabilityResponse.json();
        console.log('📥 Availability result:', availabilityResult);

        if (availabilityResult.available) {
          reply += `\n\n✅ ${availabilityResult.message}`;
          if (availabilityResult.totalPrice) {
            reply += `\n💰 Total price: $${availabilityResult.totalPrice} for ${availabilityResult.nights} night(s)`;
          }
          reply += `\n\nWould you like to proceed? I'll need:\n• Number of guests\n• Your full name\n• Email address\n• Phone number`;
        } else {
          reply += `\n\n❌ ${availabilityResult.message}`;
          if (availabilityResult.conflicts && availabilityResult.conflicts.length > 0) {
            reply += `\n\n📅 Already booked:`;
            availabilityResult.conflicts.forEach((conflict, index) => {
              const checkIn = conflict.check_in_date || conflict.appointment_date;
              const checkOut = conflict.check_out_date || conflict.appointment_time;
              reply += `\n   ${index + 1}. ${checkIn} to ${checkOut}`;
            });
            reply += `\n\nWould you like different dates or another room?`;
          }
        }
        
        return NextResponse.json({ reply });
      } catch (e) {
        console.error('❌ Availability check error:', e);
        reply = reply.split('AVAILABILITY_CHECK:')[0].trim();
        reply += '\n\n❌ Error checking availability. Please try again.';
        return NextResponse.json({ reply });
      }
    }

    // Handle BOOKING_REQUEST
    if (reply.includes('BOOKING_REQUEST:')) {
      try {
        const startIndex = reply.indexOf('BOOKING_REQUEST:') + 'BOOKING_REQUEST:'.length;
        let jsonString = reply.substring(startIndex).trim();
        
        let braceCount = 0;
        let endIndex = -1;
        
        for (let i = 0; i < jsonString.length; i++) {
          if (jsonString[i] === '{') braceCount++;
          if (jsonString[i] === '}') braceCount--;
          
          if (braceCount === 0 && jsonString[i] === '}') {
            endIndex = i + 1;
            break;
          }
        }
        
        if (endIndex > 0) {
          jsonString = jsonString.substring(0, endIndex);
        }
        
        console.log('🔍 Parsing booking:', jsonString);
        const bookingRequest = JSON.parse(jsonString);
        
        reply = reply.split('BOOKING_REQUEST:')[0].trim();
        
        const protocol = request.headers.get('x-forwarded-proto') || 'http';
        const host = request.headers.get('host') || 'localhost:3000';
        
        // Check availability first
        let availabilityCheckData = bookingRequest;
        if (bookingRequest.type === 'room' && bookingRequest.data.roomNumber) {
          // Convert roomNumber to roomId for availability check
          const roomNumberToId = {
            '101': 1, '102': 2, '103': 3, '104': 4,
            '201': 5, '202': 6, '301': 7
          };
          availabilityCheckData = {
            type: 'room',
            data: {
              roomId: roomNumberToId[bookingRequest.data.roomNumber],
              checkIn: bookingRequest.data.checkIn,
              checkOut: bookingRequest.data.checkOut
            }
          };
        }
        
        console.log('📋 Checking availability first...');
        const availabilityResponse = await fetch(`${protocol}://${host}/api/check-availability`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(availabilityCheckData)
        });

        const availabilityResult = await availabilityResponse.json();
        console.log('📥 Availability response:', availabilityResult);

        if (!availabilityResult.available) {
          reply = `I apologize, but the room/service you requested is not available for those dates. ${availabilityResult.message}`;
          
          if (availabilityResult.conflicts && availabilityResult.conflicts.length > 0) {
            reply += `\n\n📅 Already booked:`;
            availabilityResult.conflicts.forEach((conflict, index) => {
              const checkIn = conflict.check_in_date || conflict.appointment_date;
              const checkOut = conflict.check_out_date || conflict.appointment_time;
              reply += `\n   ${index + 1}. ${checkIn} to ${checkOut}`;
            });
            reply += `\n\nWould you like to:\n• Choose different dates?\n• Try another room?\n• See available rooms?`;
          }
          
          return NextResponse.json({ reply });
        }

        console.log('✅ Available! Creating booking...');
        const bookingResponse = await fetch(`${protocol}://${host}/api/bookings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bookingRequest)
        });

        const bookingResult = await bookingResponse.json();
        console.log('📥 Booking response:', bookingResult);
        
        if (bookingResult.success) {
          reply += `\n\n✅ ${bookingResult.message}`;
          bookingData = bookingResult;
        } else {
          reply += `\n\n❌ ${bookingResult.message}`;
        }
      } catch (e) {
        console.error('❌ Booking error:', e);
        reply = reply.split('BOOKING_REQUEST:')[0].trim();
        reply += '\n\n❌ Error processing booking. Please try again.';
      }
    }

    return NextResponse.json({ reply, bookingData });

  } catch (error) {
    console.error('Error in chat API:', error);
    return NextResponse.json(
      { reply: 'Sorry, something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}