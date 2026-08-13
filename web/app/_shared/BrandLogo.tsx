/* eslint-disable @next/next/no-img-element */
// 品牌標誌。素材為白色去背 PNG,只在深色底上使用。
// mark = 單獨 S 標;lockup = S 標 + SOUND SOUND audio 字標。

export function BrandMark({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/mark.png"
      alt="聲生 SSA"
      width={size}
      height={Math.round((size * 196) / 210)}
      className={`shrink-0 ${className}`}
      style={{ width: size, height: 'auto' }}
    />
  );
}

export function BrandLockup({ width = 200, className = '' }: { width?: number; className?: string }) {
  return (
    <img
      src="/brand/logo-lockup.png"
      alt="SOUND SOUND audio"
      width={width}
      height={Math.round((width * 196) / 519)}
      className={className}
      style={{ width, height: 'auto' }}
    />
  );
}
