import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

let idCounter = 0;

interface Props {
  code: string;
  dark: boolean;
}

export function MermaidBlock({ code, dark }: Props) {
  const ref  = useRef<HTMLDivElement>(null);
  const id   = useRef(`mermaid-${++idCounter}`);
  const [svg, setSvg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: dark ? 'dark' : 'neutral',
      themeVariables: dark
        ? { background: '#1A1A1A', primaryColor: '#2a2a2a', primaryTextColor: '#CCCCCC', lineColor: '#555', edgeLabelBackground: '#1A1A1A' }
        : { background: '#FFFFFF', primaryColor: '#f0f4f8', primaryTextColor: '#1A1A1A', lineColor: '#aaa' },
      fontFamily: 'inherit',
    });

    mermaid.render(id.current, code)
      .then(({ svg: out }) => { setSvg(out); setErr(''); })
      .catch((e: Error) => { setErr(e.message); setSvg(''); });
  }, [code, dark]);

  if (err) return (
    <pre style={{ color: '#e06c75', fontSize: 12, padding: '8px 12px', background: 'rgba(224,108,117,0.08)', borderRadius: 4 }}>
      {err}
    </pre>
  );

  return (
    <div ref={ref} style={{ textAlign: 'center', margin: '24px 0' }}
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}
