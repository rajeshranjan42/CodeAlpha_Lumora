import { useRef, useState } from 'react';
import { assetUrl } from '../api.js';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons.jsx';

/** Swipeable photo strip (scroll-snap) with arrows, dots and a "2/5" counter. */
export default function Carousel({ images, alt = 'Post' }) {
  const box = useRef(null);
  const [i, setI] = useState(0);

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    setI(Math.round(el.scrollLeft / el.clientWidth));
  };
  const go = (n) => {
    const el = box.current;
    if (el) el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
  };

  if (images.length === 1) return <img src={assetUrl(images[0])} alt={alt} loading="lazy" />;

  return (
    <div className="carousel">
      <div className="carousel-track" ref={box} onScroll={onScroll}>
        {images.map((src, k) => (
          <img key={src} src={assetUrl(src)} alt={`${alt} ${k + 1} of ${images.length}`} loading={k < 2 ? 'eager' : 'lazy'} draggable="false" />
        ))}
      </div>
      <span className="carousel-count">{i + 1}/{images.length}</span>
      {i > 0 && (
        <button type="button" className="carousel-nav left" onClick={() => go(i - 1)} aria-label="Previous photo">
          <ChevronLeftIcon width={20} height={20} />
        </button>
      )}
      {i < images.length - 1 && (
        <button type="button" className="carousel-nav right" onClick={() => go(i + 1)} aria-label="Next photo">
          <ChevronRightIcon width={20} height={20} />
        </button>
      )}
      <div className="carousel-dots" aria-hidden="true">
        {images.map((_, k) => (
          <i key={k} className={k === i ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}