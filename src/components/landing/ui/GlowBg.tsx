// src/components/landing/ui/GlowBg.tsx
// Background reutilizable: gradient mesh oscuro con glow azul.

export function GlowBg({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`absolute inset-0 overflow-hidden ${className}`}
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 0%, #1E3A8A 0%, #0F172A 45%, #020617 100%)',
      }}
    >
      <div
        className="absolute"
        style={{
          top: '-10%',
          right: '5%',
          width: '60%',
          height: '70%',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.35), transparent 60%)',
          filter: 'blur(40px)',
        }}
      />
      <div
        className="absolute"
        style={{
          bottom: '-20%',
          left: '-10%',
          width: '70%',
          height: '60%',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.2), transparent 60%)',
          filter: 'blur(60px)',
        }}
      />
    </div>
  );
}
