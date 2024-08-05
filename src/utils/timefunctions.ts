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
const OTTime = new Date(new Date().getTime() +0 * 60 * 60 * 1000);
const OTStartDate = new Date(OTTime.getFullYear(), OTTime.getMonth(), OTTime.getDate());

export { getTimeRemaining, getTimeToNextTurn, OTTime, OTStartDate };