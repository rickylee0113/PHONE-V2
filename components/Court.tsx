
import React, { useRef, useState, useEffect } from 'react';
import { Lineup, Position, Coordinate, TeamSide, ActionType, RoleMapping } from '../types';

interface CourtProps {
  myLineup: Lineup;
  opLineup: Lineup;
  myRoles: RoleMapping;
  opRoles: RoleMapping;
  state: 'IDLE' | 'PLAYER_SELECTED' | 'DRAWING' | 'RESULT_PENDING';
  activeSide?: TeamSide;
  selectedPos?: Position | 'L' | null;
  action?: ActionType | null;
  onDrawingComplete: (start: Coordinate, end: Coordinate) => void;
  onRotate?: (isMyTeam: boolean) => void;
}

type Point = { x: number, y: number };
type DragMode = 'start' | 'end' | 'draw_new' | null;

const ROLE_CONFIG: Record<string, { label: string, short: string, color: string, text: string }> = {
    'S': { label: '舉球', short: '舉', color: '#CA8A04', text: 'white' }, // Yellow-600
    'OH': { label: '大砲', short: '大', color: '#2563EB', text: 'white' }, // Blue-600
    'MB': { label: '快攻', short: '快', color: '#16A34A', text: 'white' }, // Green-600
    'OP': { label: '副攻', short: '副', color: '#DC2626', text: 'white' }, // Red-600
    'DS': { label: '防守', short: '防', color: '#9333EA', text: 'white' }, // Purple-600
    'L': { label: '自由', short: '自', color: '#F59E0B', text: 'black' }, // Amber-500
    '?': { label: '未知', short: '?', color: '#4B5563', text: 'white' }, // Gray-600
};

export const Court: React.FC<CourtProps> = ({ 
    myLineup, opLineup, myRoles, opRoles, state, activeSide, selectedPos, action,
    onDrawingComplete, onRotate
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  
  // --- Trajectory State ---
  const [startPos, setStartPos] = useState<Point | null>(null);
  const [endPos, setEndPos] = useState<Point | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);

  // --- 1. Coordinate Helpers ---
  
  // Convert Screen Point (px) to SVG Point (coordinate system 18x9)
  const getSVGPoint = (clientX: number, clientY: number): Point => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const pt = svgRef.current.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgP = pt.matrixTransform(svgRef.current.getScreenCTM()?.inverse());
    return { x: svgP.x, y: svgP.y };
  };

  // NEW: Normalize SVG Point (18x9) to Percentage (0-100) for storage
  const normalize = (pt: Point): Coordinate => ({
      x: (pt.x / 18) * 100,
      y: (pt.y / 9) * 100
  });

  // Get Center Coordinate for a specific rotation position
  // ignoreAction: If true, returns the standard zone center regardless of current action (used for watermarks)
  const getPositionCenter = (side: TeamSide, pos: Position | 'L', ignoreAction: boolean = false): Point => {
      // Libero defaults to pos 5 or 6 area usually, let's put them in middle back
      const posNum = pos === 'L' ? 6 : Number(pos);
      let p: Point = {x: 9, y: 4.5};

      // Standard Zone layout (3x2 grid per side)
      if (side === 'me') {
          switch(posNum) {
              case 4: p = {x: 7.5, y: 1.5}; break;
              case 3: p = {x: 7.5, y: 4.5}; break;
              case 2: p = {x: 7.5, y: 7.5}; break;
              case 5: p = {x: 3.0, y: 1.5}; break;
              case 6: p = {x: 3.0, y: 4.5}; break;
              case 1: p = {x: 3.0, y: 7.5}; break;
          }
          // If SERVE, move to outside (Left side of court), unless ignoring action (for watermarks)
          if (!ignoreAction && action === ActionType.SERVE) {
              p.x = -0.5; // Adjusted for tighter viewBox
          }
      } 
      else {
           switch(posNum) {
              case 2: p = {x: 10.5, y: 1.5}; break;
              case 3: p = {x: 10.5, y: 4.5}; break;
              case 4: p = {x: 10.5, y: 7.5}; break;
              case 1: p = {x: 15.0, y: 1.5}; break;
              case 6: p = {x: 15.0, y: 4.5}; break;
              case 5: p = {x: 15.0, y: 7.5}; break;
          }
           // If SERVE, move to outside (Right side of court), unless ignoring action (for watermarks)
           if (!ignoreAction && action === ActionType.SERVE) {
               p.x = 18.5; // Adjusted for tighter viewBox
           }
      }
      return p;
  };

  // Calculate distance between two points
  const getDistance = (p1: Point, p2: Point) => {
      return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  // --- 2. Auto-Start Logic ---
  useEffect(() => {
      if (state === 'DRAWING' && activeSide && selectedPos) {
          const center = getPositionCenter(activeSide, selectedPos);
          setStartPos(center);
      } else if (state === 'IDLE') {
          setStartPos(null);
          setEndPos(null);
      }
  }, [state, activeSide, selectedPos, action]);


  // --- 3. Interaction Handlers ---

  const handlePointerDown = (e: React.TouchEvent | React.MouseEvent) => {
    if (state !== 'DRAWING' && state !== 'RESULT_PENDING') return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const pt = getSVGPoint(clientX, clientY);

    // Hit Testing (Threshold ~ 1.5 SVG units)
    const HIT_RADIUS = 1.5;

    // Check End Point Hit
    if (endPos && getDistance(pt, endPos) < HIT_RADIUS) {
        setDragMode('end');
        return;
    }

    // Check Start Point Hit
    if (startPos && getDistance(pt, startPos) < HIT_RADIUS) {
        setDragMode('start');
        return;
    }

    // Tapping on empty space -> Set End Point
    setDragMode('end'); 
    setEndPos(pt);
  };

  const handlePointerMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!dragMode) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const pt = getSVGPoint(clientX, clientY);

    if (dragMode === 'start') {
        setStartPos(pt);
    } else if (dragMode === 'end' || dragMode === 'draw_new') {
        setEndPos(pt);
    }
  };

  const handlePointerUp = () => {
    setDragMode(null);
    // Notify parent only on release to prevent state thrashing/jumping
    if (startPos && endPos) {
        onDrawingComplete(normalize(startPos), normalize(endPos));
    }
  };

  // Only show watermarks when NOT drawing/selecting path
  const showWatermarks = state !== 'DRAWING' && state !== 'RESULT_PENDING';

  return (
    <div className="w-full h-full relative bg-[#333]">
        {/* SVG CONTAINER */}
        <svg 
            ref={svgRef}
            viewBox="-1 -0.5 20 10" 
            preserveAspectRatio="xMidYMid meet"
            className="w-full h-full touch-none select-none"
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
        >
            <defs>
                <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L6,3 z" fill="#FFF" />
                </marker>
                <marker id="target-marker" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
                    <circle cx="2" cy="2" r="1.5" fill="#EF4444" />
                </marker>
            </defs>

            {/* 1. COURT FLOOR (Back Zone Color) */}
            <rect x="0" y="0" width="18" height="9" fill="#EA580C" stroke="none" />
            
            {/* 2. FRONT ZONES (3m Line Area - Darker) */}
            {/* Left Front Zone (My Team) */}
            <rect x="6" y="0" width="3" height="9" fill="#C2410C" stroke="none" />
            {/* Right Front Zone (Op Team) */}
            <rect x="9" y="0" width="3" height="9" fill="#C2410C" stroke="none" />

            {/* 3. LINES */}
            <rect x="0" y="0" width="18" height="9" fill="none" stroke="white" strokeWidth="0.1" />
            <line x1="9" y1="-2" x2="9" y2="11" stroke="white" strokeWidth="0.1" />
            <line x1="6" y1="0" x2="6" y2="9" stroke="white" strokeWidth="0.1" />
            <line x1="12" y1="0" x2="12" y2="9" stroke="white" strokeWidth="0.1" />

            {/* 4. WATERMARKS - Simple Text, Side by Side, No Color, Hidden during Drawing */}
            {showWatermarks && [1,2,3,4,5,6].map(p => {
                const pos = p as Position;
                const {x, y} = getPositionCenter('me', pos, true);
                const roleCode = myRoles[pos] || '?';
                const role = ROLE_CONFIG[roleCode] || ROLE_CONFIG['?'];
                const num = myLineup[pos];

                return (
                    <g key={`me-${p}`} className="pointer-events-none">
                        <text 
                            x={x} y={y + 0.3} 
                            textAnchor="middle" 
                            fontSize="0.6" 
                            fill="white" 
                            opacity="0.5" 
                            fontWeight="900"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                            {num}{role.short}
                        </text>
                    </g>
                );
            })}
            {showWatermarks && [1,2,3,4,5,6].map(p => {
                const pos = p as Position;
                const {x, y} = getPositionCenter('op', pos, true);
                const roleCode = opRoles[pos] || '?';
                const role = ROLE_CONFIG[roleCode] || ROLE_CONFIG['?'];
                const num = opLineup[pos];

                return (
                    <g key={`op-${p}`} className="pointer-events-none">
                        <text 
                            x={x} y={y + 0.3} 
                            textAnchor="middle" 
                            fontSize="0.6" 
                            fill="white" 
                            opacity="0.5" 
                            fontWeight="900"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                            {num}{role.short}
                        </text>
                    </g>
                );
            })}

            {/* 5. INTERACTIVE TRAJECTORY SYSTEM */}
            {startPos && endPos && (
                <line 
                    x1={startPos.x} y1={startPos.y}
                    x2={endPos.x} y2={endPos.y}
                    stroke="white"
                    strokeWidth="0.15"
                    markerEnd="url(#arrow)"
                    strokeDasharray="0.3 0.2"
                />
            )}

            {startPos && (
                <g className="cursor-move hover:scale-110 transition-transform">
                    {/* Volleyball Icon */}
                    <circle cx={startPos.x} cy={startPos.y} r="0.6" fill="white" stroke="#222" strokeWidth="0.05" />
                    {/* Simplified Seams */}
                    <path d={`M ${startPos.x - 0.6} ${startPos.y} Q ${startPos.x} ${startPos.y - 0.4} ${startPos.x + 0.6} ${startPos.y}`} stroke="#222" strokeWidth="0.05" fill="none" />
                    <path d={`M ${startPos.x - 0.6} ${startPos.y} Q ${startPos.x} ${startPos.y + 0.4} ${startPos.x + 0.6} ${startPos.y}`} stroke="#222" strokeWidth="0.05" fill="none" />
                    <path d={`M ${startPos.x} ${startPos.y - 0.6} Q ${startPos.x + 0.4} ${startPos.y} ${startPos.x} ${startPos.y + 0.6}`} stroke="#222" strokeWidth="0.05" fill="none" />
                </g>
            )}

            {endPos && (
                <g className="cursor-move">
                    <circle cx={endPos.x} cy={endPos.y} r="1.5" fill="transparent" />
                    <circle cx={endPos.x} cy={endPos.y} r="0.4" fill="#EF4444" stroke="white" strokeWidth="0.1" />
                    <line x1={endPos.x - 0.4} y1={endPos.y} x2={endPos.x + 0.4} y2={endPos.y} stroke="white" strokeWidth="0.1" />
                    <line x1={endPos.x} y1={endPos.y - 0.4} x2={endPos.x} y2={endPos.y + 0.4} stroke="white" strokeWidth="0.1" />
                </g>
            )}

        </svg>

        {/* OVERLAY: Rotation Buttons */}
        
        {/* My Rotation (Bottom Left - Home Team) */}
        {onRotate && (
            <button 
                onClick={(e) => { e.stopPropagation(); onRotate(true); }}
                className="absolute bottom-2 left-2 w-10 h-10 bg-accent/60 text-white rounded-full flex items-center justify-center border border-white/30 backdrop-blur active:scale-95 transition-transform"
                title="Rotate My Team"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            </button>
        )}

        {/* Op Rotation (Bottom Right - Guest Team) */}
        {onRotate && (
            <button 
                onClick={(e) => { e.stopPropagation(); onRotate(false); }}
                className="absolute bottom-2 right-2 w-10 h-10 bg-red-600/60 text-white rounded-full flex items-center justify-center border border-white/30 backdrop-blur active:scale-95 transition-transform"
                title="Rotate Opponent"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            </button>
        )}
    </div>
  );
};
