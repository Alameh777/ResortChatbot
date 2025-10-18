import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Helper functions to query database
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
  // Get all booked room IDs for the date range
  const { data: bookedRooms, error } = await supabase
    .from('bookings')
    .select('room_id')
    .or(`check_in_date.lte.${checkOut},check_out_date.gte.${checkIn}`)
    .eq('status', 'confirmed');

  if (error) return null;

  const bookedRoomIds = bookedRooms.map(b => b.room_id);

  // Get available rooms (not in booked list)
  const { data: availableRooms } = await supabase
    .from('rooms')
    .select('*')
    .not('id', 'in', `(${bookedRoomIds.join(',') || '0'})`)
    .eq('is_available', true);

  return availableRooms;
}

export async function POST(request) {
  try {
    const { message } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { reply: 'API key not configured. Please add GEMINI_API_KEY to your .env.local file.' },
        { status: 500 }
      );
    }

    // Detect what the user is asking about and get relevant data
    let contextData = '';
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('room') || lowerMessage.includes('availab') || lowerMessage.includes('book')) {
      const rooms = await getRoomsAvailability();
      if (rooms && rooms.length > 0) {
        contextData += '\n\nAvailable Rooms:\n';
        rooms.forEach(room => {
          contextData += `- Room ${room.room_number}: ${room.room_type} - $${room.price_per_night}/night (Capacity: ${room.capacity}) - ${room.description}\n`;
        });
      }
    }

    if (lowerMessage.includes('spa') || lowerMessage.includes('massage') || lowerMessage.includes('treatment')) {
      const services = await getSpaServices();
      if (services && services.length > 0) {
        contextData += '\n\nSpa Services:\n';
        services.forEach(service => {
          contextData += `- ${service.service_name}: ${service.description} - $${service.price} (${service.duration_minutes} min)\n`;
        });
      }
    }

    if (lowerMessage.includes('activit') || lowerMessage.includes('things to do') || lowerMessage.includes('sport')) {
      const activities = await getActivities();
      if (activities && activities.length > 0) {
        contextData += '\n\nActivities:\n';
        activities.forEach(activity => {
          contextData += `- ${activity.activity_name}: ${activity.description} - $${activity.price} (${activity.duration_minutes} min) - ${activity.schedule}\n`;
        });
      }
    }

    // System prompt with context
    const systemPrompt = `You are a helpful AI assistant for Paradise Resort & Spa. You help guests with:
- Room availability and booking inquiries
- Spa services and appointments
- Resort activities (water sports, yoga, excursions)
- Dining options and restaurant reservations
- General resort information and amenities
- Check-in/check-out procedures

Be friendly, professional, and concise. Use the data provided below to give accurate information. Keep responses under 4-5 sentences unless more detail is needed.

${contextData}`;

    // Call Google Gemini API
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
                  text: `${systemPrompt}\n\nUser: ${message}\n\nAssistant:`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 800,
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
    const reply = data.candidates[0]?.content?.parts[0]?.text || 'Sorry, I could not generate a response.';

    return NextResponse.json({ reply });

  } catch (error) {
    console.error('Error in chat API:', error);
    return NextResponse.json(
      { reply: 'Sorry, something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}