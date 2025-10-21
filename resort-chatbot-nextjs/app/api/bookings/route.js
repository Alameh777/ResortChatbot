import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Helper function to get or create user
async function getOrCreateUser(name, email = null, phone = null) {
  try {
    // First, try to find existing user by name
    const { data: existingUser, error: searchError } = await supabase
      .from('users')
      .select('id, name, email, phone')
      .eq('name', name)
      .single();

    if (existingUser) {
      // User exists, optionally update email/phone if provided and different
      if ((email && existingUser.email !== email) || (phone && existingUser.phone !== phone)) {
        const { data: updatedUser } = await supabase
          .from('users')
          .update({
            email: email || existingUser.email,
            phone: phone || existingUser.phone
          })
          .eq('id', existingUser.id)
          .select()
          .single();
        
        return { user: updatedUser || existingUser, isNew: false };
      }
      return { user: existingUser, isNew: false };
    }

    // User doesn't exist, create new one
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        name: name,
        email: email,
        phone: phone
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating user:', insertError);
      return { user: null, error: insertError };
    }

    return { user: newUser, isNew: true };
  } catch (error) {
    console.error('Error in getOrCreateUser:', error);
    return { user: null, error };
  }
}

export async function POST(request) {
  try {
    const { type, data } = await request.json();

    if (type === 'room') {
      const { roomId, guestName, guestEmail, guestPhone, checkIn, checkOut, numGuests } = data;

      // Get or create user
      const { user, isNew, error: userError } = await getOrCreateUser(guestName, guestEmail, guestPhone);
      
      if (userError || !user) {
        return NextResponse.json({ 
          success: false, 
          message: 'Failed to process user information' 
        }, { status: 500 });
      }

      // Get room details for pricing
      const { data: room } = await supabase
        .from('rooms')
        .select('price_per_night, room_number')
        .eq('id', roomId)
        .single();

      if (!room) {
        return NextResponse.json({ 
          success: false, 
          message: 'Room not found' 
        }, { status: 404 });
      }

      // Calculate total price
      const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
      const totalPrice = room.price_per_night * nights;

      // Insert booking with user_id
      const { data: booking, error } = await supabase
        .from('bookings')
        .insert({
          room_id: roomId,
          user_id: user.id,  // Use user_id instead of guest details
          check_in_date: checkIn,
          check_out_date: checkOut,
          number_of_guests: numGuests,
          total_price: totalPrice,
          status: 'confirmed'
        })
        .select(`
          *,
          users (
            name,
            email,
            phone
          ),
          rooms (
            room_number,
            room_type
          )
        `)
        .single();

      if (error) {
        console.error('Booking error:', error);
        return NextResponse.json({ 
          success: false, 
          message: 'Failed to create booking' 
        }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        booking,
        isNewUser: isNew,
        message: `Booking confirmed for ${user.name}! ${isNew ? '(New user created) ' : ''}Booking ID: ${booking.id}. Room ${room.room_number} for ${nights} night(s). Total: $${totalPrice}`
      });
    }

    if (type === 'spa') {
      const { serviceId, guestName, guestEmail, guestPhone, appointmentDate, appointmentTime } = data;

      // Get or create user
      const { user, isNew, error: userError } = await getOrCreateUser(guestName, guestEmail, guestPhone);
      
      if (userError || !user) {
        return NextResponse.json({ 
          success: false, 
          message: 'Failed to process user information' 
        }, { status: 500 });
      }

      // Insert spa appointment with user_id
      const { data: appointment, error } = await supabase
        .from('spa_appointments')
        .insert({
          service_id: serviceId,
          user_id: user.id,  // Use user_id instead of guest details
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          status: 'confirmed'
        })
        .select(`
          *,
          users (
            name,
            email,
            phone
          ),
          spa_services (
            service_name,
            price,
            duration_minutes
          )
        `)
        .single();

      if (error) {
        console.error('Spa booking error:', error);
        return NextResponse.json({ 
          success: false, 
          message: 'Failed to create appointment' 
        }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        appointment,
        isNewUser: isNew,
        message: `Spa appointment confirmed for ${user.name}! ${isNew ? '(New user created) ' : ''}Appointment ID: ${appointment.id}.`
      });
    }

    return NextResponse.json({ 
      success: false, 
      message: 'Invalid booking type' 
    }, { status: 400 });

  } catch (error) {
    console.error('Error in bookings API:', error);
    return NextResponse.json(
      { success: false, message: 'Something went wrong' },
      { status: 500 }
    );
  }
}