// Function to handle Calendly requests (both general link and specific availability)
async function getCalendlyAvailability(userMessage) {
  try {
    const message = userMessage.toLowerCase();
    
    // Check if user specifically asks for availability/slots
    const wantsAvailability = message.includes('availability') || 
                             message.includes('available') || 
                             message.includes('slots') || 
                             message.includes('times') || 
                             message.includes('when') ||
                             message.includes('schedule');

    // If they want specific availability, fetch time slots
    if (wantsAvailability) {
      const today = new Date();
      const startDate = today.toISOString().split('T')[0];
      const endDate = new Date(today.getTime() + (7 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

      const response = await fetch(CALENDLY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          start_date: startDate,
          end_date: endDate
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log("🔍 Calendly API Response:", JSON.stringify(data, null, 2));
        
        if (data && Array.isArray(data) && data.length > 0) {
          let availabilityMessage = "📅 **Here are our available consultation slots:**\n\n";
          
          const availableSlots = data.filter(slot => slot.status === "available").slice(0, 5);
          
          if (availableSlots.length > 0) {
            availableSlots.forEach((slot, index) => {
              const startTime = new Date(slot.start_time);
              const dateStr = startTime.toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
              });
              const timeStr = startTime.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
              });
              
              availabilityMessage += `🕐 ${dateStr} at ${timeStr}\n`;
              availabilityMessage += `   📌 Book directly: ${slot.scheduling_url}\n\n`;
            });
            
            availabilityMessage += "**OR** browse all available times here: https://calendly.com/ma4ltd/30min\n\n";
            availabilityMessage += "Click any direct link above for instant booking! 🚀";
            return availabilityMessage;
          }
        }
      }
    }

    // Default response: provide general booking link + availability info
    return `📅 **Book Your Consultation**

**Quick Booking:** https://calendly.com/ma4ltd/30min

**Our Available Hours:**
- Monday-Friday: 8:00 AM - 5:00 PM GMT
- Saturday: 9:00 AM - 3:00 PM GMT

Would you like me to show you specific available time slots? Just ask for "availability" and I'll show you the next few days with direct booking links! 😊`;

  } catch (error) {
    console.error("Error getting Calendly information:", error);
    return `📅 **Book Your Consultation**

Visit: https://calendly.com/ma4ltd/30min

**Our Hours:**
- Monday-Friday: 8:00 AM - 5:00 PM GMT  
- Saturday: 9:00 AM - 3:00 PM GMT

For immediate assistance, please contact us directly!`;
  }
}
