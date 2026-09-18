import { useEffect, useState } from 'react';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

function AppSkeletonTheme({ children }) {
  const [isDay, setIsDay] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.dataset.theme === 'day';
    }
    return false;
  });

  useEffect(() => {
    const checkTheme = () => {
      setIsDay(document.documentElement.dataset.theme === 'day');
    };

    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    return () => observer.disconnect();
  }, []);

  return (
    <SkeletonTheme
      baseColor={isDay ? '#e2e8f0' : '#1f2937'}
      highlightColor={isDay ? '#f8fafc' : '#374151'}
    >
      {children}
    </SkeletonTheme>
  );
}

export { AppSkeletonTheme, Skeleton };
