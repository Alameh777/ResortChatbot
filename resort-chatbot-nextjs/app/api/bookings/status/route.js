import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Helper to parse and validate date input
function parseDate(dateString) {
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const roomId = url.searchParams.get('roomId');
    const checkIn = parseDate(url.searchParams.get('checkIn'));
    const checkOut = parseDate(url.searchParams.get('checkOut'));

    if (!roomId) {
      return NextResponse.json({ error: 'Missing roomId' }, { status: 400 });
    }

    // Fetch all bookings for that room
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('id, check_in_date, check_out_date, status, users(name), rooms(room_number)')
      .eq('room_id', roomId);

    if (error) throw error;

    // If user did not send check-in/out, just return all bookings with their status
    if (!checkIn || !checkOut) {
      return NextResponse.json({ bookings });
    }

    // Check for overlapping bookings
    const overlaps = bookings.filter(b => {
      const existingIn = new Date(b.check_in_date);
      const existingOut = new Date(b.check_out_date);
      return (
        existingIn < new Date(checkOut) &&
        existingOut > new Date(checkIn) &&
        b.status !== 'canceled'
      );
    });

    const isAvailable = overlaps.length === 0;

    return NextResponse.json({
      roomId,
      requested: { checkIn, checkOut },
      isAvailable,
      overlapping: overlaps,
      message: isAvailable
        ? 'Room is available for those dates.'
        : 'Room is not available — overlaps with existing bookings.',
    });
  } catch (err) {
    console.error('Booking status check error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
