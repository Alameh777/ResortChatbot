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

async function checkRoomAvailability(checkIn, checkOut) {
  const { data: bookedRooms, error } = await supabase
    .from('bookings')
    .select('room_id')
    .or(`check_in_date.lte.${checkOut},check_out_date.gte.${checkIn}`)
    .eq('status', 'confirmed');

  if (error) return null;

  const bookedRoomIds = bookedRooms.map(b => b.room_id);

  const { data: availableRooms } = await supabase
    .from('rooms')
    .select('*')
    .not('id', 'in', `(${bookedRoomIds.join(',') || '0'})`)
    .eq('is_available', true);

  return availableRooms;
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
          contextData += `- Room ${room.room_number} (ID: ${room.id}): ${room.room_type} - $${room.price_per_night}/night (Capacity: ${room.capacity}) - Amenities: ${room.amenities?.join(', ')}\n`;
        });
        
        if (isBookingIntent) {
  contextData += '\n\n⚠️ IMPORTANT: When creating a booking, you MUST use the numeric ID shown in parentheses (ID: X), NOT the room number. For example, Room 301 has ID: 5, so use roomId: 5 in the JSON.\n\nTo complete a booking, I need:\n1. Room ID (the number in parentheses)\n2. Check-in date (YYYY-MM-DD)\n3. Check-out date (YYYY-MM-DD)\n4. Number of guests\n5. Guest name\n6. Email address\n7. Phone number';
}
      }
    }

    if (lowerMessage.includes('spa') || lowerMessage.includes('massage') || lowerMessage.includes('treatment')) {
      const services = await getSpaServices();
      if (services && services.length > 0) {
        contextData += '\n\nSpa Services:\n';
        services.forEach(service => {
          contextData += `- ${service.service_name} (ID: ${service.id}): ${service.description} - $${service.price} (${service.duration_minutes} min)\n`;
        });
        
        if (isBookingIntent) {
          contextData += '\n\nTo book a spa service, I need:\n1. Service ID or service name\n2. Preferred date (YYYY-MM-DD)\n3. Preferred time (HH:MM in 24h format)\n4. Guest name\n5. Email address\n6. Phone number\n\nPlease provide these details.';
        }
      }
    }

    if (lowerMessage.includes('activit') || lowerMessage.includes('things to do')) {
      const activities = await getActivities();
      if (activities && activities.length > 0) {
        contextData += '\n\nActivities:\n';
        activities.forEach(activity => {
          contextData += `- ${activity.activity_name} (ID: ${activity.id}): ${activity.description} - $${activity.price || 'Free'} - Schedule: ${activity.schedule}\n`;
        });
      }
    }

    // Enhanced system prompt
    const systemPrompt = `You are a helpful AI assistant for Paradise Resort & Spa. You help guests with bookings, inquiries, and information.

IMPORTANT BOOKING INSTRUCTIONS:
- When a user wants to book, guide them through providing all required information
- CRITICAL: Use the numeric database ID (shown in parentheses as "ID: X"), NOT the room number! Example: Room 301 = ID 5, so use roomId: 5
- For room bookings: room ID (database ID), check-in/check-out dates, number of guests, name, email, phone
- For spa bookings: service ID, date, time, name, email, phone
- Be conversational and ask for missing information naturally
- Once you have ALL required information, respond with a JSON object in this EXACT format at the end of your message:

BOOKING_REQUEST: {"type":"room","data":{"roomId":1,"checkIn":"2025-12-25","checkOut":"2025-12-27","numGuests":2,"guestName":"John Doe","guestEmail":"john@email.com","guestPhone":"1234567890"}}

OR for spa:

BOOKING_REQUEST: {"type":"spa","data":{"serviceId":1,"appointmentDate":"2025-12-25","appointmentTime":"14:00","guestName":"John Doe","guestEmail":"john@email.com","guestPhone":"1234567890"}}
CRITICAL: The JSON must be VALID and COMPLETE. Ensure all braces are closed. Do not add any text after the closing brace.
Be friendly, professional, and helpful. Keep responses concise.

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
    // Check if AI wants to make a booking
if (reply.includes('BOOKING_REQUEST:')) {
  // More aggressive regex to capture complete JSON
  const bookingMatch = reply.match(/BOOKING_REQUEST:\s*(\{[\s\S]*\})/);
  if (bookingMatch) {
    try {
      // Clean up the JSON string
      let jsonString = bookingMatch[1].trim();
      
      // Remove any trailing text after the JSON
      const lastBrace = jsonString.lastIndexOf('}');
      if (lastBrace !== -1) {
        jsonString = jsonString.substring(0, lastBrace + 1);
      }
      
      console.log('🔍 Attempting to parse JSON:', jsonString);
      const bookingRequest = JSON.parse(jsonString);
          
          // Remove ALL booking request JSON from the reply (including multiple occurrences)
      reply = reply.replace(/BOOKING_REQUEST:\s*\{[\s\S]*?\}/g, '').trim();

// Clean up any leftover whitespace or duplicate spaces
      reply = reply.replace(/\s+/g, ' ').trim();
          
          // Make the booking
          const bookingResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/bookings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookingRequest)
          });

          const bookingResult = await bookingResponse.json();
          
          if (bookingResult.success) {
            reply += `\n\n✅ ${bookingResult.message}`;
            bookingData = bookingResult;
          } else {
            reply += `\n\n❌ Booking failed: ${bookingResult.message}`;
          }
        } catch (e) {
          console.error('Booking processing error:', e);
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