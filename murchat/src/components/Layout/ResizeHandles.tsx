import React, { useEffect, useCallback } from 'react';
import './ResizeHandles.css';

type ResizeDirection = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const ResizeHandles: React.FC = () => {
  
  const handleMouseDown = useCallback((e: React.MouseEvent, direction: ResizeDirection) => {
    e.preventDefault();
    
    const startX = e.screenX;
    const startY = e.screenY;
    const startWidth = window.outerWidth;
    const startHeight = window.outerHeight;
    // window.screenX/Y are integer coordinates of the window on screen
    const startWinX = window.screenX; 
    const startWinY = window.screenY;

    const handleMouseMove = (e: MouseEvent) => {
        const deltaX = e.screenX - startX;
        const deltaY = e.screenY - startY;
        
        let newWidth = startWidth;
        let newHeight = startHeight;
        let newX = startWinX;
        let newY = startWinY;

        // Horizontal Resizing
        if (direction.includes('right')) {
            newWidth = startWidth + deltaX;
        } else if (direction.includes('left')) {
            newWidth = startWidth - deltaX;
            newX = startWinX + deltaX;
        }

        // Vertical Resizing
        if (direction.includes('bottom')) {
            newHeight = startHeight + deltaY;
        } else if (direction.includes('top')) {
            newHeight = startHeight - deltaY;
            newY = startWinY + deltaY;
        }

        // Apply changes
        // Note: We need to check min limits here if desired, but Electron handles min-width usually
        if (newWidth > 400 && newHeight > 300) {
            // Move first if needed (left/top resize)
            if (direction.includes('left') || direction.includes('top')) {
                 window.moveTo(newX, newY);
            }
            window.resizeTo(newWidth, newHeight);
        }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, []);

  return (
    <>
      <div className="resize-handle-top" onMouseDown={(e) => handleMouseDown(e, 'top')} />
      <div className="resize-handle-bottom" onMouseDown={(e) => handleMouseDown(e, 'bottom')} />
      <div className="resize-handle-left" onMouseDown={(e) => handleMouseDown(e, 'left')} />
      <div className="resize-handle-right" onMouseDown={(e) => handleMouseDown(e, 'right')} />
      
      <div className="resize-handle-top-left" onMouseDown={(e) => handleMouseDown(e, 'top-left')} />
      <div className="resize-handle-top-right" onMouseDown={(e) => handleMouseDown(e, 'top-right')} />
      <div className="resize-handle-bottom-left" onMouseDown={(e) => handleMouseDown(e, 'bottom-left')} />
      <div className="resize-handle-bottom-right" onMouseDown={(e) => handleMouseDown(e, 'bottom-right')} />
    </>
  );
};

export default ResizeHandles;