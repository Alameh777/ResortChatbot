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
    const lowerMessage = message.toLowerCase();

    // Detect what the user is asking about and provide information
    if (lowerMessage.includes('room') || lowerMessage.includes('availab')) {
      const rooms = await getRoomsAvailability();
      if (rooms && rooms.length > 0) {
        contextData += '\n\nAvailable Rooms:\n';
        rooms.forEach(room => {
          contextData += `- Room ${room.room_number}: ${room.room_type} - $${room.price_per_night}/night (Capacity: ${room.capacity}) - Amenities: ${room.amenities?.join(', ')}\n`;
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

    if (lowerMessage.includes('activit') || lowerMessage.includes('things to do')) {
      const activities = await getActivities();
      if (activities && activities.length > 0) {
        contextData += '\n\nActivities:\n';
        activities.forEach(activity => {
          contextData += `- ${activity.activity_name}: ${activity.description} - $${activity.price || 'Free'} - Schedule: ${activity.schedule}\n`;
        });
      }
    }

    // Simplified system prompt - information only, no booking
    const systemPrompt = `You are a helpful AI assistant for Paradise Resort & Spa. You help guests by providing information about:
- Room types, prices, and amenities
- Spa services and treatments
- Resort activities and schedules
- General resort information and facilities
- Dining options and operating hours

Be friendly, professional, and informative. Keep responses concise (3-5 sentences) unless more detail is requested.

IMPORTANT: You provide information only. For actual bookings, politely tell guests to:
- Call our reception: +1 (555) 123-4567
- Email: reservations@paradiseresort.com
- Visit our booking page: www.paradiseresort.com/book

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
                  text: `${systemPrompt}\n\nConversation context: ${conversationContext || 'New conversation'}\n\nUser: ${message}\n\nAssistant:`
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