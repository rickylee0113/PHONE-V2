
import React, { useState, useMemo } from 'react';
import { LogEntry, TeamConfig, TeamSide, ActionType, ResultType } from '../types';
// @ts-ignore
import html2canvas from 'html2canvas';

interface StatsOverlayProps {
  logs: LogEntry[];
  teamConfig: TeamConfig;
  myScore: number;
  opScore: number;
  mySetWins: number;
  opSetWins: number;
  onBack: () => void;
  currentSet: number;
}

interface StatSummary {
  attackKills: number;
  attackTotal: number;
  blocks: number;
  serveAces: number;
  serveErrors: number;
  digs: number;
  totalPoints: number;
}

export const StatsOverlay: React.FC<StatsOverlayProps> = ({
  logs,
  teamConfig,
  myScore,
  opScore,
  mySetWins,
  opSetWins,
  onBack,
  currentSet
}) => {
  const [activeTab, setActiveTab] = useState<TeamSide>('me');
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Helper: Filter logs for a specific team
  const getTeamLogs = (side: TeamSide) => {
    return logs.filter(l => {
      const isMyAction = l.note === teamConfig.myName;
      const logTeam: TeamSide = isMyAction ? 'me' : 'op';
      return logTeam === side;
    });
  };

  // Helper: Filter logs for a specific player
  const getPlayerLogs = (playerNum: string, side: TeamSide) => {
    return getTeamLogs(side).filter(l => l.playerNumber === playerNum);
  };

  // Helper: Calculate Stats
  const calculateStats = (filteredLogs: LogEntry[]): StatSummary => {
    let stats = {
      attackKills: 0,
      attackTotal: 0,
      blocks: 0,
      serveAces: 0,
      serveErrors: 0,
      digs: 0,
      totalPoints: 0
    };

    filteredLogs.forEach(l => {
      if (l.action === ActionType.ATTACK) {
        stats.attackTotal++;
        if (l.result === ResultType.POINT) stats.attackKills++;
      }
      if (l.action === ActionType.BLOCK && l.result === ResultType.POINT) {
        stats.blocks++;
      }
      if (l.action === ActionType.SERVE) {
        if (l.result === ResultType.POINT) stats.serveAces++;
        if (l.result === ResultType.ERROR) stats.serveErrors++;
      }
      if (l.action === ActionType.DIG) {
        stats.digs++;
      }
    });

    stats.totalPoints = stats.attackKills + stats.blocks + stats.serveAces;
    return stats;
  };

  // Pre-calculate Team Stats
  const myTeamStats = calculateStats(getTeamLogs('me'));
  const opTeamStats = calculateStats(getTeamLogs('op'));

  const currentPlayerStats = selectedPlayer 
    ? calculateStats(getPlayerLogs(selectedPlayer, activeTab)) 
    : null;

  // Get list of players for the ACTIVE TAB
  const activePlayersList = useMemo(() => {
    const teamLogs = getTeamLogs(activeTab);
    const players = Array.from(new Set(teamLogs.map(l => l.playerNumber))).sort((a: string, b: string) => parseInt(a) - parseInt(b));
    
    const playerPoints = players.map(p => {
        const pStats = calculateStats(teamLogs.filter(l => l.playerNumber === p));
        return { number: p, points: pStats.totalPoints };
    });

    const sortedByPoints = [...playerPoints].sort((a, b) => b.points - a.points);
    const top1 = sortedByPoints[0]?.points > 0 ? sortedByPoints[0].number : null;
    const top2 = sortedByPoints[1]?.points > 0 ? sortedByPoints[1].number : null;

    return { players, top1, top2 };
  }, [logs, activeTab, teamConfig]);


  // --- VISUALIZER ENGINE ---
  const renderShotChart = (customLogs?: LogEntry[], orientation: 'landscape' | 'portrait' = 'landscape') => {
    if (!selectedPlayer && !customLogs) return null;
    
    const logsToUse = customLogs || getPlayerLogs(selectedPlayer!, activeTab);
    const drawLogs = logsToUse.filter(l => 
        (l.action === ActionType.ATTACK || l.action === ActionType.SERVE) && 
        l.startCoord && l.endCoord
    );

    const isPortrait = orientation === 'portrait';
    const markerIdSuffix = isPortrait ? '-export' : '';

    // --- COORDINATE SYSTEM CONFIG ---
    // Long Axis (18m) = 200 units.
    // Short Axis (9m) = 100 units.
    
    // Padding Logic: 40 units (~3.6m) margin all around.
    // Landscape ViewBox: x:-40, y:-40, w:280, h:180. (Court at 0,0 to 200,100)
    // Portrait ViewBox: x:-40, y:-40, w:180, h:280. (Court at 0,0 to 100,200)
    
    const landscapeViewBox = "-40 -40 280 180";
    const portraitViewBox = "-40 -40 180 280";
    const viewBox = isPortrait ? portraitViewBox : landscapeViewBox;

    // Aspect Ratios:
    // Landscape: 280/180 ≈ 1.55 (14/9)
    // Portrait: 180/280 ≈ 0.64 (9/14)

    const containerClasses = isPortrait
        ? 'w-full h-full bg-slate-100' // Parent controls height in export
        : 'w-full aspect-[14/9] bg-slate-100 border border-slate-300 shadow-md my-4'; 

    // Mapping Functions
    const mapX = (percentX: number, percentY: number) => {
        if (isPortrait) {
            return percentY; 
        } else {
            return percentX * 2;
        }
    };

    const mapY = (percentX: number, percentY: number) => {
         if (isPortrait) {
             return percentX * 2;
         } else {
             return percentY;
         }
    };

    // Background Rect Dimensions (Out of Bounds Area)
    // These fill the ViewBox to create the "Gray" background effect
    const bgRect = isPortrait 
        ? { x: -40, y: -40, w: 180, h: 280 } 
        : { x: -40, y: -40, w: 280, h: 180 };

    return (
      <div className={`relative ${containerClasses} overflow-hidden rounded-lg`}>
        
        <svg 
            viewBox={viewBox} 
            className="w-full h-full"
            preserveAspectRatio="xMidYMid meet"
        >
            <defs>
                <marker id={`arrow-point-attack${markerIdSuffix}`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
                    <path d="M0,0 L0,4 L4,2 z" fill="#10B981" />
                </marker>
                <marker id={`arrow-point-serve${markerIdSuffix}`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
                    <path d="M0,0 L0,4 L4,2 z" fill="#3B82F6" />
                </marker>
                <marker id={`arrow-error${markerIdSuffix}`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
                    <path d="M0,0 L0,4 L4,2 z" fill="#EF4444" />
                </marker>
                <marker id={`arrow-normal${markerIdSuffix}`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
                    <path d="M0,0 L0,4 L4,2 z" fill="#9CA3AF" />
                </marker>
            </defs>

            {/* 0. BACKGROUND (Out of Bounds Color) */}
            <rect 
                x={bgRect.x} y={bgRect.y} 
                width={bgRect.w} height={bgRect.h} 
                fill="#F1F5F9" // slate-100
            />

            {/* 1. COURT FLOOR & LINES */}
            {/* Main Court Rectangle (In Bounds) */}
            <rect 
                x="0" y="0" 
                width={isPortrait ? 100 : 200} 
                height={isPortrait ? 200 : 100} 
                fill="white" 
                stroke="black" 
                strokeWidth="2" 
            />

            {/* FRONT ZONE (3m area) - Slightly Darker for visualization */}
            {isPortrait ? (
                <>
                    {/* Top Front Zone */}
                    <rect x="0" y="66.6" width="100" height="33.3" fill="#F1F5F9" stroke="none" />
                    {/* Bottom Front Zone */}
                    <rect x="0" y="100" width="100" height="33.3" fill="#F1F5F9" stroke="none" />
                </>
            ) : (
                <>
                    {/* Left Front Zone */}
                    <rect x="66.6" y="0" width="33.3" height="100" fill="#F1F5F9" stroke="none" />
                    {/* Right Front Zone */}
                    <rect x="100" y="0" width="33.3" height="100" fill="#F1F5F9" stroke="none" />
                </>
            )}

            {/* Net Line (Center) */}
            {isPortrait ? (
                <line x1="0" y1="100" x2="100" y2="100" stroke="black" strokeWidth="3" />
            ) : (
                <line x1="100" y1="0" x2="100" y2="100" stroke="black" strokeWidth="3" />
            )}

            {/* 3m Lines (Over the fill) */}
            {isPortrait ? (
                <>
                    <line x1="0" y1="66.6" x2="100" y2="66.6" stroke="black" strokeWidth="1" opacity="0.3" />
                    <line x1="0" y1="133.3" x2="100" y2="133.3" stroke="black" strokeWidth="1" opacity="0.3" />
                </>
            ) : (
                <>
                    <line x1="66.6" y1="0" x2="66.6" y2="100" stroke="black" strokeWidth="1" opacity="0.3" />
                    <line x1="133.3" y1="0" x2="133.3" y2="100" stroke="black" strokeWidth="1" opacity="0.3" />
                </>
            )}

            {/* 2. TEAM WATERMARKS (TEAM NAMES) */}
            <g className="pointer-events-none opacity-15 font-black" style={{ userSelect: 'none' }}>
                {isPortrait ? (
                    <>
                        {/* Top Half (My Team / Left Side) */}
                        <text x="50" y="50" textAnchor="middle" dominantBaseline="middle" fontSize="16" fill="black" transform="rotate(-90, 50, 50) translate(0, 0)">
                             {teamConfig.myName}
                        </text>
                        {/* Bottom Half (Op Team / Right Side) */}
                        <text x="50" y="150" textAnchor="middle" dominantBaseline="middle" fontSize="16" fill="black" transform="rotate(-90, 50, 150) translate(0, 0)">
                             {teamConfig.opName}
                        </text>
                    </>
                ) : (
                    <>
                        {/* Left Half (My Team) */}
                        <text x="50" y="50" textAnchor="middle" dominantBaseline="middle" fontSize="24" fill="black">
                            {teamConfig.myName}
                        </text>
                        {/* Right Half (Op Team) */}
                        <text x="150" y="50" textAnchor="middle" dominantBaseline="middle" fontSize="24" fill="black">
                            {teamConfig.opName}
                        </text>
                    </>
                )}
            </g>

            {/* 3. TRAJECTORY LINES */}
            {drawLogs.map(l => {
                let color = '#9CA3AF';
                let markerId = `arrow-normal${markerIdSuffix}`;

                if (l.result === ResultType.ERROR) {
                    color = '#EF4444'; 
                    markerId = `arrow-error${markerIdSuffix}`;
                } else if (l.result === ResultType.POINT) {
                    if (l.action === ActionType.SERVE) {
                        color = '#3B82F6';
                        markerId = `arrow-point-serve${markerIdSuffix}`;
                    } else {
                        color = '#10B981';
                        markerId = `arrow-point-attack${markerIdSuffix}`;
                    }
                }

                // Map coordinates
                const x1 = mapX(l.startCoord!.x, l.startCoord!.y);
                const y1 = mapY(l.startCoord!.x, l.startCoord!.y);
                const x2 = mapX(l.endCoord!.x, l.endCoord!.y);
                const y2 = mapY(l.endCoord!.x, l.endCoord!.y);

                return (
                    <g key={l.id}>
                        <line 
                            x1={x1} y1={y1}
                            x2={x2} y2={y2}
                            stroke={color}
                            strokeWidth="1.5"
                            opacity="0.9"
                            markerEnd={`url(#${markerId})`}
                        />
                        <circle cx={x1} cy={y1} r="2" fill={color} stroke="white" strokeWidth="0.5" />
                    </g>
                );
            })}
        </svg>

        {drawLogs.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 font-bold pointer-events-none">
                無路徑資料
            </div>
        )}
      </div>
    );
  };

  const renderComparisonRow = (label: string, myVal: string | number, opVal: string | number, highlightMy: boolean = false, highlightOp: boolean = false) => (
      <div className="grid grid-cols-[1fr_auto_1fr] items-center py-2 border-b border-slate-100 last:border-0">
          <div className={`text-xl font-black text-center ${highlightMy ? 'text-accent' : 'text-slate-700'}`}>{myVal}</div>
          <div className="text-xs text-slate-400 font-bold uppercase tracking-wider text-center px-2 w-24">{label}</div>
          <div className={`text-xl font-black text-center ${highlightOp ? 'text-red-600' : 'text-slate-700'}`}>{opVal}</div>
      </div>
  );

  const renderPlayerStatRow = (label: string, value: string | number, colorClass: string = 'text-slate-800') => (
      <div className="flex justify-between items-center py-3 border-b border-slate-200 last:border-0">
          <span className="text-slate-500 font-bold">{label}</span>
          <span className={`text-xl font-black ${colorClass}`}>{value}</span>
      </div>
  );

  const handleDownloadImage = async () => {
    const element = document.getElementById('export-card');
    if (!element || isDownloading) return;

    setIsDownloading(true);
    try {
        const canvas = await html2canvas(element, { 
            scale: 2, 
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true 
        });
        
        const link = document.createElement('a');
        const fileName = `${teamConfig.matchName || 'match'}_set${currentSet}_P${selectedPlayer}.png`;
        link.download = fileName;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (err) {
        console.error('Export failed', err);
        alert('匯出圖片失敗');
    } finally {
        setIsDownloading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[200] bg-white flex flex-col animate-fade-in overflow-hidden text-slate-900">
      
      {/* 1. Header & Navigation */}
      <div className="bg-slate-900 p-3 flex justify-between items-center shrink-0 shadow-md">
          <div className="flex gap-2">
            <button 
                onClick={onBack}
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors"
            >
                ← 返回比賽
            </button>
            {selectedPlayer && (
                <button 
                    onClick={() => setSelectedPlayer(null)}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors border border-slate-600"
                >
                    ← 回總覽
                </button>
            )}
          </div>
          <div className="text-white font-bold text-lg">數據統計</div>
      </div>

      {/* 2. Content Area */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
          
          {selectedPlayer ? (
              // === PLAYER DETAIL VIEW ===
              <div className="p-4 pb-20">
                  <div id="export-card" className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-4">
                      <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-4">
                          <div>
                              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Player Profile</div>
                              <div className="text-4xl font-black text-slate-900 flex items-center gap-2">
                                  <span className="text-accent">#{selectedPlayer}</span>
                              </div>
                              <div className="text-sm font-bold text-slate-500 mt-1">
                                  {activeTab === 'me' ? teamConfig.myName : teamConfig.opName}
                              </div>
                          </div>
                          <div className="text-right">
                               <div className="text-xs font-bold text-slate-400 uppercase mb-1">Total Points</div>
                               <div className="text-4xl font-black text-emerald-600">{currentPlayerStats?.totalPoints}</div>
                          </div>
                      </div>
                      
                      {/* Shot Chart Visualizer */}
                      <div className="mb-6">
                           <div className="text-xs font-bold text-slate-400 uppercase mb-2">Shot Chart (Attacks & Serves)</div>
                           {renderShotChart(undefined, 'landscape')}
                      </div>

                      <div className="space-y-1">
                          {renderPlayerStatRow("攻擊得分 (Kills)", currentPlayerStats?.attackKills || 0, "text-emerald-600")}
                          {renderPlayerStatRow("攻擊總數 (Attacks)", currentPlayerStats?.attackTotal || 0)}
                          {renderPlayerStatRow("攔網得分 (Blocks)", currentPlayerStats?.blocks || 0, "text-blue-600")}
                          {renderPlayerStatRow("發球得分 (Aces)", currentPlayerStats?.serveAces || 0, "text-indigo-600")}
                          {renderPlayerStatRow("發球失誤 (Errors)", currentPlayerStats?.serveErrors || 0, "text-red-500")}
                          {renderPlayerStatRow("防守 (Digs)", currentPlayerStats?.digs || 0, "text-orange-500")}
                      </div>
                  </div>
                  
                  <button 
                    onClick={handleDownloadImage}
                    disabled={isDownloading}
                    className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                     {isDownloading ? '匯出中...' : '📥 下載球員卡'}
                  </button>
              </div>
          ) : (
              // === TEAM OVERVIEW VIEW ===
              <div className="p-4 pb-20">
                   
                   {/* Score Summary */}
                   <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-4 flex items-center justify-between">
                        <div className="text-center">
                            <div className="text-3xl font-black text-accent mb-1">{mySetWins}</div>
                            <div className="text-xs font-bold text-slate-400">SETS</div>
                        </div>
                        <div className="flex flex-col items-center px-4 flex-1">
                             <div className="flex items-center gap-4 text-5xl font-black text-slate-900 leading-none">
                                 <span>{myScore}</span>
                                 <span className="text-slate-300 text-3xl">-</span>
                                 <span>{opScore}</span>
                             </div>
                             <div className="text-xs font-bold text-slate-400 mt-2 bg-slate-100 px-3 py-1 rounded-full">SET {currentSet}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-3xl font-black text-red-500 mb-1">{opSetWins}</div>
                            <div className="text-xs font-bold text-slate-400">SETS</div>
                        </div>
                   </div>

                   {/* Comparison Table */}
                   <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-4">
                        <div className="flex justify-between mb-4 border-b border-slate-100 pb-2">
                             <span className="font-bold text-accent truncate max-w-[40%]">{teamConfig.myName}</span>
                             <span className="font-bold text-red-500 truncate max-w-[40%]">{teamConfig.opName}</span>
                        </div>
                        <div className="space-y-1">
                            {renderComparisonRow("Points", myTeamStats.totalPoints, opTeamStats.totalPoints, myTeamStats.totalPoints > opTeamStats.totalPoints, opTeamStats.totalPoints > myTeamStats.totalPoints)}
                            {renderComparisonRow("Kills", myTeamStats.attackKills, opTeamStats.attackKills)}
                            {renderComparisonRow("Blocks", myTeamStats.blocks, opTeamStats.blocks)}
                            {renderComparisonRow("Aces", myTeamStats.serveAces, opTeamStats.serveAces)}
                            {renderComparisonRow("Digs", myTeamStats.digs, opTeamStats.digs)}
                            {renderComparisonRow("S.Err", myTeamStats.serveErrors, opTeamStats.serveErrors)}
                        </div>
                   </div>

                   {/* Player List */}
                   <div>
                       <div className="flex gap-2 mb-3">
                           <button 
                              onClick={() => setActiveTab('me')}
                              className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'me' ? 'bg-accent text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}
                           >
                               我方球員
                           </button>
                           <button 
                              onClick={() => setActiveTab('op')}
                              className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'op' ? 'bg-red-500 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}
                           >
                               對手球員
                           </button>
                       </div>
                       
                       <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                           {activePlayersList.players.map(p => {
                               const isTopScorer = p === activePlayersList.top1;
                               const isSecondScorer = p === activePlayersList.top2;
                               
                               return (
                                   <button 
                                      key={p} 
                                      onClick={() => setSelectedPlayer(p)}
                                      className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md transition-all text-left relative overflow-hidden group"
                                   >
                                       {isTopScorer && <div className="absolute top-0 right-0 bg-yellow-400 text-[10px] font-black px-2 py-0.5 rounded-bl-lg text-yellow-900">MVP</div>}
                                       {isSecondScorer && <div className="absolute top-0 right-0 bg-slate-300 text-[10px] font-black px-2 py-0.5 rounded-bl-lg text-slate-700">2nd</div>}
                                       
                                       <div className="text-3xl font-black text-slate-900 mb-1">#{p}</div>
                                       <div className="text-xs font-bold text-slate-400 group-hover:text-blue-500">查看數據 →</div>
                                   </button>
                               );
                           })}
                           {activePlayersList.players.length === 0 && (
                               <div className="col-span-full py-8 text-center text-slate-400 font-bold bg-white rounded-xl border border-slate-200 border-dashed">
                                   尚無球員數據
                               </div>
                           )}
                       </div>
                   </div>
              </div>
          )}
      </div>
    </div>
  );
};
