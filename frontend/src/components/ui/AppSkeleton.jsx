import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

const skeletonTheme = {
  baseColor: '#1f2937',
  highlightColor: '#374151'
};

function AppSkeletonTheme({ children }) {
  return (
    <SkeletonTheme {...skeletonTheme}>
      {children}
    </SkeletonTheme>
  );
}

export { AppSkeletonTheme, Skeleton };
