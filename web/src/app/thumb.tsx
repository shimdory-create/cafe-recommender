/**
 * 카드 대표 이미지.
 *
 * 카카오 블로그 썸네일은 **130x130 정사각**이다. 카드 상단의 큰 사진으로
 * 늘리면 뭉개지므로 상호명 옆 작은 정사각으로만 쓴다 (스펙 10.4).
 *
 * `next/image` 를 쓰지 않는다 — 원격 호스트 허용 목록을 관리해야 하고,
 * 130px 이미지에 최적화 파이프라인을 태울 이득이 없다.
 *
 * 이미지가 없거나 URL 이 깨진 경우(카카오 CDN 링크는 영구 보장이 아니다)
 * 회색 자리표시자를 보여준다. 매일 화제량 수집이 새 썸네일로 갱신하므로
 * 깨진 이미지는 자연히 회복된다.
 */
export function Thumb(
  { src, alt, size = 60, icon = '☕' }: { src: string | null; alt: string; size?: number; icon?: string },
) {
  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-xl bg-bean-soft"
      style={{ width: size, height: size }}
      aria-hidden={src ? undefined : true}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[18px] text-bean/50">
          {icon}
        </span>
      )}
    </span>
  )
}
