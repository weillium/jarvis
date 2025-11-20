'use client';

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'sm' | 'md';
}

const sizeStyles = {
  sm: {
    padding: '8px 12px',
    fontSize: '13px',
    height: '20px',
  },
  md: {
    padding: '10px 12px',
    fontSize: '14px',
    height: '24px',
  },
};

export function Select({ size = 'md', style, className, ...props }: SelectProps) {
  const sizeStyle = sizeStyles[size];
  
  return (
    <select
      {...props}
      className={className}
      style={{
        fontFamily: 'inherit',
        borderRadius: '4px',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--borderColor, #e0e0e0)',
        backgroundColor: 'var(--background, #ffffff)',
        color: 'var(--color, #000000)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        ...sizeStyle,
        ...style,
      }}
    />
  );
}
