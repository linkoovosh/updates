import React from 'react';
import './Badge.css';

interface BadgeProps {
    count?: number;
    variant?: 'dot' | 'count';
    color?: 'red' | 'gray';
    className?: string;
    max?: number;
}

export const Badge: React.FC<BadgeProps> = ({ 
    count = 0, 
    variant = 'count', 
    color = 'red', 
    className = '', 
    max = 99 
}) => {
    if (variant === 'count' && count <= 0) return null;

    const displayCount = count > max ? `${max}+` : count;

    return (
        <div className={`badge variant-${variant} color-${color} ${className}`}>
            {variant === 'count' && displayCount}
        </div>
    );
};
