
import React, { useState, useEffect } from 'react';
import { SetupView } from './components/SetupView';
import { GameView } from './components/GameView';
import { Lineup, TeamConfig, LogEntry, TeamSide, GameState, RoleMapping } from './types';

// Helper functions to generate FRESH state objects every time
const getInitialLineup = (): Lineup => ({ 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' });
const getInitialRoles = (): RoleMapping => ({ 1: '?', 2: '?', 3: '?', 4: '?', 5: '?', 6: '?' });
const getInitialConfig = (): TeamConfig => ({ matchName: '', myName: '', opName: '' });

const App: React.FC = () => {
  const [view, setView] = useState<'setup' | 'game'>('setup');
  const [isPortrait, setIsPortrait] = useState(false);
  const [isGameActive, setIsGameActive] = useState(false); 
  const [setupKey, setSetupKey] = useState(0); 
  
  // Team Configuration
  const [teamConfig, setTeamConfig] = useState<TeamConfig>(getInitialConfig());

  // Current Game State
  const [currentSet, setCurrentSet] = useState(1);
  const [mySetWins, setMySetWins] = useState(0);
  const [opSetWins, setOpSetWins] = useState(0);
  
  const [myLineup, setMyLineup] = useState<Lineup>(getInitialLineup());
  const [opLineup, setOpLineup] = useState<Lineup>(getInitialLineup());
  
  // Roles
  const [myRoles, setMyRoles] = useState<RoleMapping>(getInitialRoles());
  const [opRoles, setOpRoles] = useState<RoleMapping>(getInitialRoles());

  // Liberos
  const [myLibero, setMyLibero] = useState<string>('');
  const [opLibero, setOpLibero] = useState<string>('');

  const [myScore, setMyScore] = useState(0);
  const [opScore, setOpScore] = useState(0);
  const [servingTeam, setServingTeam] = useState<TeamSide>('me');
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // History Stacks
  const [history, setHistory] = useState<GameState[]>([]);
  const [future, setFuture] = useState<GameState[]>([]);

  // PWA Install Prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    setDeferredPrompt(null);
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (view === 'game' && logs.length > 0) {
        e.preventDefault();
        e.returnValue = ''; 
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [view, logs]);

  const getCurrentState = (): GameState => ({
    currentSet, mySetWins, opSetWins, myLineup, opLineup, myRoles, opRoles, myLibero, opLibero, myScore, opScore, servingTeam, logs
  });

  const pushHistory = () => {
    const current = getCurrentState();
    setHistory(prev => [...prev, current]);
    setFuture([]); 
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    const current = getCurrentState();

    setFuture(prev => [current, ...prev]); 
    setHistory(prev => prev.slice(0, -1)); 

    setCurrentSet(previous.currentSet);
    setMySetWins(previous.mySetWins);
    setOpSetWins(previous.opSetWins);
    setMyLineup(previous.myLineup);
    setOpLineup(previous.opLineup);
    setMyRoles(previous.myRoles || getInitialRoles());
    setOpRoles(previous.opRoles || getInitialRoles());
    setMyLibero(previous.myLibero);
    setOpLibero(previous.opLibero);
    setMyScore(previous.myScore);
    setOpScore(previous.opScore);
    setServingTeam(previous.servingTeam);
    setLogs(previous.logs);
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const next = future[0];
    const current = getCurrentState();

    setHistory(prev => [...prev, current]); 
    setFuture(prev => prev.slice(1)); 

    setCurrentSet(next.currentSet);
    setMySetWins(next.mySetWins);
    setOpSetWins(next.opSetWins);
    setMyLineup(next.myLineup);
    setOpLineup(next.opLineup);
    setMyRoles(next.myRoles || getInitialRoles());
    setOpRoles(next.opRoles || getInitialRoles());
    setMyLibero(next.myLibero);
    setOpLibero(next.opLibero);
    setMyScore(next.myScore);
    setOpScore(next.opScore);
    setServingTeam(next.servingTeam);
    setLogs(next.logs);
  };

  const handleGameStart = (
      config: TeamConfig, 
      initialMyLineup: Lineup, 
      initialOpLineup: Lineup, 
      initialMyRoles: RoleMapping,
      initialOpRoles: RoleMapping,
      initialMyLibero: string, 
      initialOpLibero: string, 
      initialServingTeam: TeamSide
    ) => {
    setTeamConfig(config);
    setMyLineup(initialMyLineup);
    setOpLineup(initialOpLineup);
    setMyRoles(initialMyRoles);
    setOpRoles(initialOpRoles);
    setMyLibero(initialMyLibero);
    setOpLibero(initialOpLibero);
    setMyScore(0);
    setOpScore(0);
    setServingTeam(initialServingTeam);
    
    setHistory([]); 
    setFuture([]);
    
    setView('game');
    setIsGameActive(true);
  };

  const handleResumeGame = () => {
      setView('game');
  };

  const handleHome = () => {
      setView('setup');
  };

  // --- HARD RESET FUNCTION ---
  const handleNewMatch = () => {
    console.log("Triggering Full Match Reset");
    // 1. Reset Data with fresh objects
    setTeamConfig(getInitialConfig());
    setMyLineup(getInitialLineup());
    setOpLineup(getInitialLineup());
    setMyRoles(getInitialRoles());
    setOpRoles(getInitialRoles());
    setMyLibero('');
    setOpLibero('');
    
    // 2. Reset Scores & State
    setCurrentSet(1);
    setMySetWins(0);
    setOpSetWins(0);
    setMyScore(0);
    setOpScore(0);
    setLogs([]);
    setHistory([]);
    setFuture([]);
    
    // 3. Reset View State
    setIsGameActive(false);
    
    // 4. Force Remount of SetupView
    setSetupKey(prev => prev + 1); 
    setView('setup');
  };

  const handleNextSet = () => {
    pushHistory(); 
    if (myScore > opScore) {
      setMySetWins(prev => prev + 1);
    } else if (opScore > myScore) {
      setOpSetWins(prev => prev + 1);
    }
    setCurrentSet(prev => prev + 1);
    setView('setup'); 
  };

  const handleGameAction = (
    newLog: LogEntry | null, 
    scoreUpdate: { myDelta: number, opDelta: number } | null,
    lineupUpdate: { isMyTeam: boolean, newLineup: Lineup, newLibero?: string } | null,
    newServingTeam: TeamSide | null
  ) => {
    pushHistory();
    if (newLog) setLogs(prev => [...prev, { ...newLog, setNumber: currentSet }]);
    if (scoreUpdate) {
        setMyScore(prev => prev + scoreUpdate.myDelta);
        setOpScore(prev => prev + scoreUpdate.opDelta);
    }
    if (lineupUpdate) {
       if (lineupUpdate.isMyTeam) {
           setMyLineup(lineupUpdate.newLineup);
           if (lineupUpdate.newLibero !== undefined) setMyLibero(lineupUpdate.newLibero);
       } else {
           setOpLineup(lineupUpdate.newLineup);
           if (lineupUpdate.newLibero !== undefined) setOpLibero(lineupUpdate.newLibero);
       }
    }
    if (newServingTeam) setServingTeam(newServingTeam);
  };

  const handleLoadGame = (savedState: GameState, config: TeamConfig) => {
    setTeamConfig(config);
    setCurrentSet(savedState.currentSet || 1); 
    setMySetWins(savedState.mySetWins || 0);
    setOpSetWins(savedState.opSetWins || 0);
    setMyLineup(savedState.myLineup);
    setOpLineup(savedState.opLineup);
    setMyRoles(savedState.myRoles || getInitialRoles());
    setOpRoles(savedState.opRoles || getInitialRoles());
    setMyLibero(savedState.myLibero || '');
    setOpLibero(savedState.opLibero || '');
    setMyScore(savedState.myScore);
    setOpScore(savedState.opScore);
    setServingTeam(savedState.servingTeam);
    setLogs(savedState.logs);
    setHistory([]);
    setFuture([]);
    setIsGameActive(true);
  };

  const simulatorClasses = view === 'setup'
      ? "md:w-[430px] md:h-[932px]" 
      : "md:w-[932px] md:h-[430px]";

  return (
    <div className="fixed inset-0 w-full h-full bg-[#111] flex items-center justify-center font-sans">
        <div className={`relative w-full h-full ${simulatorClasses} md:max-w-[95vw] md:max-h-[95vh] md:rounded-[3rem] md:border-[12px] md:border-[#222] md:shadow-[0_0_60px_rgba(0,0,0,0.6)] overflow-hidden bg-neutral-900 transition-all duration-500 ease-in-out`}>
            {view === 'game' && isPortrait && (
                <div className="absolute inset-0 z-[9999] bg-black/95 flex flex-col items-center justify-center text-white p-8 text-center animate-fade-in">
                    <div className="text-6xl mb-6 animate-pulse">⟳</div>
                    <h2 className="text-2xl font-bold mb-2">請旋轉螢幕</h2>
                    <p className="text-gray-400">為了最佳操作體驗<br/>比賽記錄模式請使用<span className="text-accent font-bold">橫向</span>顯示</p>
                </div>
            )}

            {view === 'setup' ? (
            <SetupView 
                key={setupKey} // THIS KEY IS CRITICAL FOR RESET
                initialConfig={teamConfig}
                initialMyLineup={myLineup}
                initialOpLineup={opLineup}
                initialMyRoles={myRoles}
                initialOpRoles={opRoles}
                initialMyLibero={myLibero}
                initialOpLibero={opLibero}
                onStart={handleGameStart}
                onInstallApp={deferredPrompt ? handleInstallClick : undefined}
                onToggleFullScreen={toggleFullScreen}
                isGameActive={isGameActive}
                onResume={handleResumeGame}
                onNewMatch={handleNewMatch}
            />
            ) : (
            <GameView 
                teamConfig={teamConfig}
                currentSet={currentSet}
                mySetWins={mySetWins}
                opSetWins={opSetWins}
                initialMyLineup={myLineup}
                initialOpLineup={opLineup}
                initialMyRoles={myRoles}
                initialOpRoles={opRoles}
                initialMyLibero={myLibero}
                initialOpLibero={opLibero}
                myScore={myScore}
                opScore={opScore}
                servingTeam={servingTeam}
                logs={logs}
                onGameAction={handleGameAction}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onLoadGame={handleLoadGame}
                onNewSet={handleNextSet}
                canUndo={history.length > 0}
                canRedo={future.length > 0}
                onExit={handleHome}
                onToggleFullScreen={toggleFullScreen}
            />
            )}
        </div>
    </div>
  );
};

export default App;
