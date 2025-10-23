import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request) {
  try {
    const { type, data } = await request.json();

    if (type === 'room') {
      const { roomId, checkIn, checkOut } = data;

      // Validate dates are not in the past
      const checkInDate = new Date(checkIn);
      const checkOutDate = new Date(checkOut);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (checkInDate < today) {
        return NextResponse.json({ 
          available: false, 
          message: '❌ Cannot check availability for past dates. Check-in date must be today or in the future.' 
        }, { status: 400 });
      }

      if (checkOutDate < today) {
        return NextResponse.json({ 
          available: false, 
          message: '❌ Cannot check availability for past dates. Check-out date must be today or in the future.' 
        }, { status: 400 });
      }

      // Get room details
      const { data: room } = await supabase
        .from('rooms')
        .select('room_number, room_type, price_per_night')
        .eq('id', roomId)
        .single();

      if (!room) {
        return NextResponse.json({ 
          available: false, 
          message: 'Room not found' 
        }, { status: 404 });
      }

      // Check for conflicting bookings (exclude cancelled)
      const { data: conflicts } = await supabase
        .from('bookings')
        .select('id, check_in_date, check_out_date, status')
        .eq('room_id', roomId)
        .neq('status', 'cancelled')
        .or(`and(check_in_date.lte.${checkOut},check_out_date.gte.${checkIn})`);

      const available = !conflicts || conflicts.length === 0;

      if (!available) {
        return NextResponse.json({
          available: false,
          message: `Room ${room.room_number} (${room.room_type}) is already booked for the dates ${checkIn} to ${checkOut}.`,
          conflicts: conflicts
        });
      }

      // Calculate price
      const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
      const totalPrice = room.price_per_night * nights;

      return NextResponse.json({
        available: true,
        message: `✅ Room ${room.room_number} (${room.room_type}) is available!`,
        room: room,
        nights: nights,
        totalPrice: totalPrice
      });
    }

    if (type === 'spa') {
      const { serviceId, appointmentDate, appointmentTime } = data;

      // Validate date is not in the past
      const apptDate = new Date(appointmentDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (apptDate < today) {
        return NextResponse.json({ 
          available: false, 
          message: '❌ Cannot check availability for past dates. Appointment date must be today or in the future.' 
        }, { status: 400 });
      }

      // Get service details
      const { data: service } = await supabase
        .from('spa_services')
        .select('service_name, duration_minutes, price')
        .eq('id', serviceId)
        .single();

      if (!service) {
        return NextResponse.json({ 
          available: false, 
          message: 'Service not found' 
        }, { status: 404 });
      }

      // Check for conflicting appointments (exclude cancelled)
      const { data: conflicts } = await supabase
        .from('spa_appointments')
        .select('id, appointment_time, status')
        .eq('service_id', serviceId)
        .eq('appointment_date', appointmentDate)
        .eq('appointment_time', appointmentTime)
        .neq('status', 'cancelled');

      const available = !conflicts || conflicts.length === 0;

      if (!available) {
        return NextResponse.json({
          available: false,
          message: `${service.service_name} is not available at ${appointmentTime} on ${appointmentDate}.`,
          conflicts: conflicts
        });
      }

      return NextResponse.json({
        available: true,
        message: `✅ ${service.service_name} is available at ${appointmentTime} on ${appointmentDate}!`,
        service: service
      });
    }

    return NextResponse.json({ 
      available: false, 
      message: 'Invalid type' 
    }, { status: 400 });

  } catch (error) {
    console.error('Error checking availability:', error);
    return NextResponse.json(
      { available: false, message: 'Error checking availability' },
      { status: 500 }
    );
  }
}