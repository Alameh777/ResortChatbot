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

      // Validate dates are not in the past
      const checkInDate = new Date(checkIn);
      const checkOutDate = new Date(checkOut);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (checkInDate < today) {
        return NextResponse.json({ 
          success: false, 
          message: '❌ Cannot book dates in the past. Please select a future check-in date.' 
        }, { status: 400 });
      }

      if (checkOutDate < today) {
        return NextResponse.json({ 
          success: false, 
          message: '❌ Cannot book dates in the past. Please select a future check-out date.' 
        }, { status: 400 });
      }

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

      // Check for existing bookings that overlap with requested dates
      const { data: existingBookings } = await supabase
        .from('bookings')
        .select('id, check_in_date, check_out_date')
        .eq('room_id', roomId)
        .neq('status', 'cancelled')
        .or(`and(check_in_date.lte.${checkOut},check_out_date.gte.${checkIn})`);

      if (existingBookings && existingBookings.length > 0) {
        return NextResponse.json({ 
          success: false, 
          message: `Room ${room.room_number} is not available for the selected dates. Please choose different dates or another room.`,
          conflictingBookings: existingBookings
        }, { status: 409 });
      }

      // Calculate total price
      const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
      const totalPrice = room.price_per_night * nights;

      // Insert booking with user_id with status 'pending'
      const { data: booking, error } = await supabase
        .from('bookings')
        .insert({
          room_id: roomId,
          user_id: user.id,
          check_in_date: checkIn,
          check_out_date: checkOut,
          number_of_guests: numGuests,
          total_price: totalPrice,
          status: 'pending'  // Explicitly set to pending
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
        message: `Booking request submitted for ${user.name}! ${isNew ? '(New user created) ' : ''}Booking ID: ${booking.id}. Room ${room.room_number} for ${nights} night(s). Total: $${totalPrice}. Status: PENDING - Awaiting confirmation.`
      });
    }

    if (type === 'spa') {
      const { serviceId, guestName, guestEmail, guestPhone, appointmentDate, appointmentTime } = data;

      // Validate date is not in the past
      const apptDate = new Date(appointmentDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (apptDate < today) {
        return NextResponse.json({ 
          success: false, 
          message: '❌ Cannot book appointments in the past. Please select a future date.' 
        }, { status: 400 });
      }

      // Get or create user
      const { user, isNew, error: userError } = await getOrCreateUser(guestName, guestEmail, guestPhone);
      
      if (userError || !user) {
        return NextResponse.json({ 
          success: false, 
          message: 'Failed to process user information' 
        }, { status: 500 });
      }

      // Get service details
      const { data: service } = await supabase
        .from('spa_services')
        .select('service_name, duration_minutes, price')
        .eq('id', serviceId)
        .single();

      if (!service) {
        return NextResponse.json({ 
          success: false, 
          message: 'Service not found' 
        }, { status: 404 });
      }

      // Check for existing appointments at the same time
      const { data: existingAppointments } = await supabase
        .from('spa_appointments')
        .select('id, appointment_time')
        .eq('service_id', serviceId)
        .eq('appointment_date', appointmentDate)
        .eq('appointment_time', appointmentTime)
        .neq('status', 'cancelled');

      if (existingAppointments && existingAppointments.length > 0) {
        return NextResponse.json({ 
          success: false, 
          message: `The ${service.service_name} service is not available at ${appointmentTime} on ${appointmentDate}. Please choose a different time.`,
          conflictingAppointments: existingAppointments
        }, { status: 409 });
      }

      // Insert spa appointment with user_id with status 'pending'
      const { data: appointment, error } = await supabase
        .from('spa_appointments')
        .insert({
          service_id: serviceId,
          user_id: user.id,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          status: 'pending'  // Explicitly set to pending
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
        message: `Spa appointment request submitted for ${user.name}! ${isNew ? '(New user created) ' : ''}Appointment ID: ${appointment.id}. ${service.service_name} on ${appointmentDate} at ${appointmentTime}. Status: PENDING - Awaiting confirmation.`
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