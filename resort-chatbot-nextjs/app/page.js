'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';

export default function Home() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    // Set initial message on client side only
    setMessages([
      {
        type: 'bot',
        text: 'Hi! 👋 Welcome to our resort. How can I help you today?',
        timestamp: new Date()
      }
    ]);
  }, []);

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMessage = {
      type: 'user',
      text: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue('');
    setIsTyping(true);

    try {
      // Build conversation context from recent messages
      const conversationContext = messages.slice(-6).map(m => 
        `${m.type === 'user' ? 'User' : 'Assistant'}: ${m.text}`
      ).join('\n');

      // Call our API route
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: currentInput,
          conversationContext 
        }),
      });

      const data = await response.json();

      const botMessage = {
        type: 'bot',
        text: data.reply || 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
        bookingData: data.bookingData
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      const errorMessage = {
        type: 'bot',
        text: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickActions = [
    '🏨 Check Availability',
    '💆 Book Spa',
    '🎯 View Activities',
    '📞 Contact Us'
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Demo Website Content */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-800 mb-4">
            Paradise Resort & Spa
          </h1>
          <p className="text-lg sm:text-xl text-gray-600">
            Your perfect getaway awaits. Try our AI assistant!
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <div className="bg-white p-6 rounded-xl shadow-lg">
            <div className="text-4xl mb-4">🏨</div>
            <h3 className="text-xl font-semibold mb-2">Luxury Rooms</h3>
            <p className="text-gray-600">
              Experience comfort in our beautifully designed rooms with ocean views.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-lg">
            <div className="text-4xl mb-4">💆</div>
            <h3 className="text-xl font-semibold mb-2">World-Class Spa</h3>
            <p className="text-gray-600">
              Rejuvenate your mind and body with our premium spa services.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-lg">
            <div className="text-4xl mb-4">🎯</div>
            <h3 className="text-xl font-semibold mb-2">Activities</h3>
            <p className="text-gray-600">
              From water sports to yoga, we have something for everyone.
            </p>
          </div>
        </div>
      </div>

      {/* Chatbot Widget */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 font-sans">
        {/* Chat Window */}
        {isOpen && (
          <div className="mb-4 w-96 max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-8rem)] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300 sm:w-96">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <MessageCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Resort Assistant</h3>
                  <p className="text-xs text-blue-100">Online now</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="hover:bg-white/20 p-2 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                      message.type === 'user'
                        ? 'bg-blue-600 text-white rounded-br-sm'
                        : 'bg-white text-gray-800 rounded-bl-sm shadow-sm'
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-black">{message.text}</p>
                    <p
                      className={`text-xs mt-1 ${
                        message.type === 'user' ? 'text-blue-100' : 'text-gray-400'
                      }`}
                    >
                      {message.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              ))}
              {/* Typing Indicator */}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Actions */}
            {messages.length === 1 && (
              <div className="px-4 py-2 bg-white border-t">
                <p className="text-xs text-gray-500 mb-2">Quick actions:</p>
                <div className="grid grid-cols-2 gap-2">
                  {quickActions.map((action, index) => (
                    <button
                      key={index}
                      onClick={() => setInputValue(action)}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-3 rounded-lg transition-colors text-left"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input Area */}
            <div className="p-4 bg-white border-t">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message..."
                  className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm text-black focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isTyping}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-full p-2 transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
            className="w-14 h-14 sm:w-16 sm:h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group"
        >
          {isOpen ? (
            <X className="w-7 h-7 group-hover:rotate-90 transition-transform" />
          ) : (
            <MessageCircle className="w-7 h-7 group-hover:scale-110 transition-transform" />
          )}
        </button>

        {/* Notification Badge */}
        {!isOpen && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">1</span>
          </div>
        )}
      </div>
    </div>
  );
}