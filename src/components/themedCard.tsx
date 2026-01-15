export default function ThemedCard() {
  return (
    <div className="relative min-h-[220px] w-full max-w-md bg-[#2b3444] p-8 text-white">
      {/* Outer border */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          border: '1px solid #5f9e46',
          boxShadow: '0 0 6px rgba(182, 240, 142, 0.3)',
        }}
      />

      {/* Inner border */}
      <div
        className="pointer-events-none absolute inset-[4px]"
        style={{
          border: '1px solid #b6f08e',
          boxShadow: '0 0 6px rgba(182, 240, 142, 0.3)',
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        <h1 className="mb-2 text-xl font-bold">OT Themed Card Title</h1>
        <p className="text-sm text-slate-300">Some descriptive text here.</p>
      </div>
    </div>
  );
}
