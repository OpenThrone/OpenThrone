export const fetchWithFallback = async (
  socket: any,
  isConnected: boolean,
  wsEvent: string,
  fallbackUrl: string,
  payload: object,
  setData: (data: any) => void,
  setLoading: (loading: boolean) => void
) => {
  setLoading(true);
  try {
    if (socket && isConnected) {
      console.log(`Using WebSocket for ${wsEvent}`, payload);
      socket.emit(wsEvent, payload);
    } else {
      console.log(`WebSocket unavailable, falling back to API: ${fallbackUrl}`);
      const response = await fetch(fallbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Failed to fetch data');
      const data = await response.json();
      setData(data);
    }
  } catch (error) {
    console.error(`Error in fetchWithFallback: ${error}`);
  } finally {
    setLoading(false);
  }
};