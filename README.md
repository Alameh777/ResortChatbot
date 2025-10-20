```🏨 Resort Chatbot - AI-Powered Booking Assistant
📋 Project Overview
An intelligent chatbot for resort websites that helps guests with:

Room availability & booking
Spa service reservations
Activity information & scheduling
General resort inquiries

Built with Next.js, Google Gemini AI, and Supabase - completely free infrastructure!

🎯 Key Features
✅ Smart AI Conversations - Natural language understanding powered by Google Gemini
✅ Real-time Database Integration - Live room availability and booking management
✅ Multi-step Booking Flow - Collects guest information conversationally
✅ Embeddable Widget - Floating chat bubble that works on any website
✅ Mobile Responsive - Works perfectly on all devices
✅ Zero Cost - Uses only free tier services

🛠️ Tech Stack
TechnologyPurposeWhy We Chose ItNext.js 15Full-stack frameworkFrontend + Backend in one project, easy deploymentReact 18UI libraryComponent-based architecture, modern hooksTailwind CSSStylingFast, responsive, utility-first CSSGoogle Gemini AINatural language processingFree tier, powerful, understands contextSupabasePostgreSQL databaseFree tier, real-time updates, easy to useVercelHosting & deploymentFree hosting, automatic deployments

📁 Project Structure
resort-chatbot-nextjs/
├── app/
│ ├── page.js # Main chatbot UI component
│ ├── layout.js # Root layout with metadata
│ ├── api/
│ │ ├── chat/
│ │ │ └── route.js # AI conversation handler
│ │ └── bookings/
│ │ └── route.js # Booking creation API
│ └── globals.css # Tailwind imports
├── lib/
│ └── supabase.js # Supabase client configuration
├── .env.local # Environment variables (not in git)
├── package.json # Dependencies and scripts
├── tailwind.config.js # Tailwind configuration
└── next.config.js # Next.js configuration```

🔧 Setup & Installation
Prerequisites

Node.js 18+ installed
Git installed
GitHub account
Google account (for Gemini API)
Supabase account (free)

Step 1: Clone & Install```
bashgit clone https://github.com/YOUR_USERNAME/ResortChatbot.git
cd ResortChatbot/resort-chatbot-nextjs
npm install
Step 2: Environment Variables
Create .env.local file in the root:
envGEMINI_API_KEY=your_gemini_api_key_here
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
Get API Keys:

Gemini API: https://aistudio.google.com/app/apikey
Supabase: Create project at https://supabase.com → Settings → API

Step 3: Database Setup

Go to Supabase dashboard → SQL Editor
Run the schema from database-schema.sql (creates tables + sample data)
Tables created: rooms, bookings, spa_services, spa_appointments, activities

Step 4: Run Development Server
bashnpm run dev
Open http://localhost:3000
