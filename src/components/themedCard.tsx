export default function ThemedCard() {
  return (
    <div className="relative w-full max-w-md min-h-[220px] bg-[#2b3444] text-white p-8">
      {/* Outer border */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          border: '1px solid #5f9e46',
          boxShadow: '0 0 6px rgba(182, 240, 142, 0.3)',
        }}
      />

      {/* Inner border */}
      <div
        className="absolute inset-[4px] pointer-events-none"
        style={{
          border: '1px solid #b6f08e',
          boxShadow: '0 0 6px rgba(182, 240, 142, 0.3)',
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        <h1 className="text-xl font-bold mb-2">OT Themed Card Title</h1>
        <p className="text-sm text-slate-300">Some descriptive text here.</p>
      </div>
    </div>
  );
}