import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request) {
  try {
    const { type, data } = await request.json();

    if (type === 'room') {
      // Create room booking
      const { roomId, guestName, guestEmail, guestPhone, checkIn, checkOut, numGuests } = data;

      // Get room details for pricing
      const { data: room } = await supabase
        .from('rooms')
        .select('price_per_night')
        .eq('id', roomId)
        .single();

      if (!room) {
        return NextResponse.json({ success: false, message: 'Room not found' }, { status: 404 });
      }

      // Calculate total price
      const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
      const totalPrice = room.price_per_night * nights;

      // Insert booking
      const { data: booking, error } = await supabase
        .from('bookings')
        .insert({
          room_id: roomId,
          guest_name: guestName,
          guest_email: guestEmail,
          guest_phone: guestPhone,
          check_in_date: checkIn,
          check_out_date: checkOut,
          number_of_guests: numGuests,
          total_price: totalPrice,
          status: 'confirmed'
        })
        .select()
        .single();

      if (error) {
        console.error('Booking error:', error);
        return NextResponse.json({ success: false, message: 'Failed to create booking' }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        booking,
        message: `Booking confirmed! Booking ID: ${booking.id}. Total: $${totalPrice} for ${nights} night(s).`
      });
    }

    if (type === 'spa') {
      // Create spa appointment
      const { serviceId, guestName, guestEmail, guestPhone, appointmentDate, appointmentTime } = data;

      const { data: appointment, error } = await supabase
        .from('spa_appointments')
        .insert({
          service_id: serviceId,
          guest_name: guestName,
          guest_email: guestEmail,
          guest_phone: guestPhone,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          status: 'confirmed'
        })
        .select()
        .single();

      if (error) {
        console.error('Spa booking error:', error);
        return NextResponse.json({ success: false, message: 'Failed to create appointment' }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        appointment,
        message: `Spa appointment confirmed! Appointment ID: ${appointment.id}.`
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid booking type' }, { status: 400 });

  } catch (error) {
    console.error('Error in bookings API:', error);
    return NextResponse.json(
      { success: false, message: 'Something went wrong' },
      { status: 500 }
    );
  }
}