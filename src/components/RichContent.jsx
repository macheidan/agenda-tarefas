import { useMemo } from 'react';
import { processLinks } from '../utils/processLinks';

export default function RichContent({ html, className }) {
  const processed = useMemo(() => processLinks(html), [html]);

  const handleClick = (e) => {
    if (e.target.closest('a')) e.stopPropagation();
  };

  return (
    <div
      className={className}
      data-rich-content="true"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: processed || '' }}
    />
  );
}
