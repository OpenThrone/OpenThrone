// https://www.sitepoint.com/build-javascript-countdown-timer-no-dependencies/
const getTimeRemaining = (endtime: string) => {
  const total = Date.parse(endtime) - new Date().getTime();
  const seconds = Math.floor((total / 1000) % 60);
  const minutes = Math.floor((total / 1000 / 60) % 60);
  const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
  const days = Math.floor(total / (1000 * 60 * 60 * 24));

  return {
    total,
    days,
    hours,
    minutes,
    seconds,
  };
};

const getTimeToNextTurn = (date = new Date()) => {
  const ms = 1800000; // 30mins in ms
  const nextTurn = new Date(Math.ceil(date.getTime() / ms) * ms);
  return nextTurn.toString();
}; 

// Get the current time according to the server
const getOTTime = () => {
  return new Date();
};

// Get a Date object representing the beginning of this day
const getOTStartDate = (add:number = 0) => {
  const OTTime = getOTTime();
  return new Date(OTTime.getFullYear(), OTTime.getMonth(), OTTime.getDate()+add);
};

const formatLastMessageTime = (lastMessageTime: any): React.ReactNode => {
    const date = new Date(lastMessageTime);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString();
    }
  }

export { getTimeRemaining, getTimeToNextTurn, getOTTime, getOTStartDate, formatLastMessageTime };
