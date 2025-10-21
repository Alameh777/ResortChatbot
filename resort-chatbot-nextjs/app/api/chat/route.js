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

// Check room availability for specific dates
async function checkRoomAvailabilityForDates(roomId, checkIn, checkOut) {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('room_id', roomId)
    .in('status', ['confirmed', 'pending'])
    .or(`and(check_in_date.lte.${checkOut},check_out_date.gte.${checkIn})`);

  if (error) return { available: false };
  return { available: data.length === 0 };
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

    // Check if user wants to book
    const isBookingIntent = lowerMessage.includes('book') || 
                           lowerMessage.includes('reserve') || 
                           lowerMessage.includes('make a reservation');

    // Detect what the user is asking about
    if (lowerMessage.includes('room') || lowerMessage.includes('availab') || isBookingIntent) {
      const rooms = await getRoomsAvailability();
      if (rooms && rooms.length > 0) {
        contextData += '\n\nAvailable Rooms:\n';
        rooms.forEach(room => {
          contextData += `- Room ${room.room_number}: ${room.room_type} - $${room.price_per_night}/night (Capacity: ${room.capacity}) - Amenities: ${room.amenities?.join(', ')}\n`;
        });
        
        if (isBookingIntent) {
          contextData += '\n\n⚠️ IMPORTANT: Before booking, you MUST check if the room is available for the requested dates. When you have all booking details (room, dates, guest info), create the booking request and our system will verify availability.\n\nTo complete a booking, I need:\n1. Room number (e.g., Room 101)\n2. Check-in date (YYYY-MM-DD)\n3. Check-out date (YYYY-MM-DD)\n4. Number of guests\n5. Guest name\n6. Email address\n7. Phone number';
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

    // Enhanced system prompt
    const systemPrompt = `You are a helpful AI assistant for Paradise Resort & Spa. You help guests with bookings, inquiries, and information.

IMPORTANT BOOKING INSTRUCTIONS:
- When a user wants to book, guide them through providing all required information
- For room bookings: room number, check-in/check-out dates, number of guests, name, email, phone
- For spa bookings: service name, date, time, name, email, phone
- CRITICAL: You must map room numbers to their database IDs. Available rooms with their IDs:
  * Room 101 = ID 1
  * Room 102 = ID 2
  * Room 103 = ID 6
  * Room 104 = ID 7
  * Room 201 = ID 3
  * Room 202 = ID 4
  * Room 301 = ID 5
- Once you have ALL required information, respond naturally and include the BOOKING_REQUEST JSON
- The booking will create a PENDING reservation that staff will review
- Our system automatically checks if the room is available for those dates
- Do NOT ask "Please confirm" or show the JSON to users - just create the request
- Be conversational and ask for missing information naturally

BOOKING_REQUEST FORMAT:
For rooms: BOOKING_REQUEST: {"type":"room","data":{"roomId":1,"checkIn":"2025-12-25","checkOut":"2025-12-27","numGuests":2,"guestName":"John Doe","guestEmail":"john@email.com","guestPhone":"1234567890"}}

For spa: BOOKING_REQUEST: {"type":"spa","data":{"serviceId":1,"appointmentDate":"2025-12-25","appointmentTime":"14:00","guestName":"John Doe","guestEmail":"john@email.com","guestPhone":"1234567890"}}

CRITICAL: The JSON must be VALID and COMPLETE. Ensure all braces are closed. Do not add any text after the closing brace.

Be friendly, professional, and helpful. Keep responses concise.

CRITICAL :You should always confirm availability before confirming the booking.
          You can also answer general questions about the resort.
      
${contextData}`;

    // Call Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${systemPrompt}\n\nConversation context: ${conversationContext || 'New conversation'}\n\nUser: ${message}\n\nAssistant:`
                }
              ]
            }
          ],
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
    let reply = data.candidates[0]?.content?.parts[0]?.text || 'Sorry, I could not generate a response.';

    // Check if AI wants to make a booking
    if (reply.includes('BOOKING_REQUEST:')) {

      const { type, data } = bookingRequest;
if (type === 'room') {
  const { roomId, checkIn, checkOut } = data;

  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  const host = request.headers.get('host') || 'localhost:3000';

  const statusUrl = `${protocol}://${host}/api/bookings/status?roomId=${roomId}&checkIn=${checkIn}&checkOut=${checkOut}`;
  const statusRes = await fetch(statusUrl);
  const statusData = await statusRes.json();

  if (!statusRes.ok || !statusData.isAvailable) {
    reply += `\n\n⚠️ Sorry, this room is not available for those dates.\n${statusData.overlapping?.length ? 'Existing bookings:\n' + statusData.overlapping.map(o => `• ${o.check_in_date} → ${o.check_out_date} (${o.status})`).join('\n') : ''}`;
    return NextResponse.json({ reply }); // Stop booking creation
  }
}
      const bookingMatch = reply.match(/BOOKING_REQUEST:\s*(\{[\s\S]*\})/);
      if (bookingMatch) {
        try {
          let jsonString = bookingMatch[1].trim();
          const lastBrace = jsonString.lastIndexOf('}');
          if (lastBrace !== -1) {
            jsonString = jsonString.substring(0, lastBrace + 1);
          }
          
          console.log('🔍 Attempting to parse JSON:', jsonString);
          const bookingRequest = JSON.parse(jsonString);
          
          // Remove ALL booking request JSON from the reply
          reply = reply.replace(/BOOKING_REQUEST:\s*\{[\s\S]*?\}/g, '').trim();
          reply = reply.replace(/\s+/g, ' ').trim();
          
          // Make the booking
          console.log('📤 Sending booking request:', bookingRequest);
          const protocol = request.headers.get('x-forwarded-proto') || 'http';
          const host = request.headers.get('host') || 'localhost:3000';
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
          console.error('Booking processing error:', e);
          reply += '\n\n❌ Sorry, there was an error processing your booking. Please try again.';
        }
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