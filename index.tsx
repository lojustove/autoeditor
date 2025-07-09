import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

// Types
type Subtitle = {
    id: number;
    start: number; // in seconds
    end: number;   // in seconds
    text: string;
};

type ZoomEffect = 'zoom-in' | 'zoom-out' | 'pan' | 'none';

// SRT Parser Utility
const parseSrt = (srtContent: string): Subtitle[] => {
    const timeToSeconds = (time: string): number => {
        try {
            const [h, m, s] = time.split(':');
            const [sec, ms] = s.split(',');
            return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(sec) + parseInt(ms) / 1000;
        } catch (e) {
            return 0;
        }
    };

    const blocks = srtContent.trim().split(/\r?\n\r?\n/).filter(block => block.trim());
    
    return blocks.map(block => {
        const lines = block.split(/\r?\n/);
        if (lines.length < 2) return null;

        const id = parseInt(lines[0], 10);
        const timeStr = lines[1];
        const text = lines.slice(2).join(' ');

        if (isNaN(id) || !timeStr || !timeStr.includes(' --> ')) return null;

        const [startStr, endStr] = timeStr.split(' --> ');
        
        return {
            id,
            start: timeToSeconds(startStr),
            end: timeToSeconds(endStr),
            text,
        };
    }).filter((s): s is Subtitle => s !== null && !isNaN(s.start) && !isNaN(s.end));
};

const App = () => {
    // File states
    const [images, setImages] = useState<File[]>([]);
    const [audio, setAudio] = useState<File | null>(null);
    const [music, setMusic] = useState<File | null>(null);
    const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
    const [srtFileName, setSrtFileName] = useState<string>('');

    // Object URL states
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [audioUrl, setAudioUrl] = useState<string>('');
    const [musicUrl, setMusicUrl] = useState<string>('');

    // Settings states
    const [duration, setDuration] = useState<number>(7);
    const [zoomEffect, setZoomEffect] = useState<ZoomEffect>('zoom-in');
    const [musicVolume, setMusicVolume] = useState<number>(0.5);
    
    // Preview & Export states
    const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
    const [isExporting, setIsExporting] = useState<boolean>(false);
    const [exportProgress, setExportProgress] = useState<number>(0);
    const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
    const [currentSubtitle, setCurrentSubtitle] = useState<string>('');

    // Refs
    const audioRef = useRef<HTMLAudioElement>(null);
    const musicRef = useRef<HTMLAudioElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageIntervalRef = useRef<number | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const isReadyForPreview = imageUrls.length > 0 && audioUrl;

    // Effect to create/revoke object URLs
    useEffect(() => {
        const urls = images.map(image => URL.createObjectURL(image));
        setImageUrls(urls);
        return () => urls.forEach(URL.revokeObjectURL);
    }, [images]);

    useEffect(() => {
        if (!audio) { setAudioUrl(''); return; }
        const url = URL.createObjectURL(audio);
        setAudioUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [audio]);

    useEffect(() => {
        if (!music) { setMusicUrl(''); return; }
        const url = URL.createObjectURL(music);
        setMusicUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [music]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) setImages(Array.from(e.target.files));
    };

    const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) setAudio(e.target.files[0]);
    };

    const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) setMusic(e.target.files[0]);
    };

    const handleSrtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSrtFileName(file.name);
            const reader = new FileReader();
            reader.onload = (event) => {
                if(event.target?.result) setSubtitles(parseSrt(event.target.result as string));
            };
            reader.readAsText(file);
        }
    };
    
    const stopPreview = useCallback(() => {
        if (imageIntervalRef.current) clearInterval(imageIntervalRef.current);
        imageIntervalRef.current = null;
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        if (musicRef.current) {
            musicRef.current.pause();
            musicRef.current.currentTime = 0;
        }
        setIsPreviewing(false);
        setCurrentImageIndex(0);
        setCurrentSubtitle('');
    }, []);

    const startPreview = () => {
        if (!isReadyForPreview) return;
        
        stopPreview();
        setIsPreviewing(true);

        audioRef.current?.play().catch(error => {
            console.error('Audio playback failed:', error);
            stopPreview();
        });
        if (musicRef.current) {
             musicRef.current.play().catch(console.error);
        }

        imageIntervalRef.current = window.setInterval(() => {
            setCurrentImageIndex(prevIndex => (prevIndex + 1) % images.length);
        }, duration * 1000);
    };

    useEffect(() => {
        if(musicRef.current) musicRef.current.volume = musicVolume;
    }, [musicVolume]);

    const handleReset = () => {
        stopPreview();
        setImages([]);
        setAudio(null);
        setMusic(null);
        setSubtitles([]);
        setSrtFileName('');
        setDuration(7);
        setZoomEffect('zoom-in');
        setMusicVolume(0.5);
    };

    useEffect(() => {
        const audioEl = audioRef.current;
        if (!audioEl || !isPreviewing) return;
        
        const handleTimeUpdate = () => {
            const subtitle = subtitles.find(s => 
                audioEl.currentTime >= s.start && audioEl.currentTime <= s.end
            );
            setCurrentSubtitle(subtitle ? subtitle.text : '');
        };

        const handleAudioEnd = () => stopPreview();

        audioEl.addEventListener('timeupdate', handleTimeUpdate);
        audioEl.addEventListener('ended', handleAudioEnd);

        return () => {
            audioEl.removeEventListener('timeupdate', handleTimeUpdate);
            audioEl.removeEventListener('ended', handleAudioEnd);
        };
    }, [subtitles, stopPreview, isPreviewing]);

    const drawCanvasFrame = useCallback((ctx, currentTime, imageElements) => {
        const { width, height } = ctx.canvas;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, height);

        const imageIndex = Math.floor(currentTime / duration) % imageElements.length;
        const img = imageElements[imageIndex];
        if (!img) return;
        
        const timeInImage = currentTime % duration;
        const progress = timeInImage / duration;
        
        let scale = 1.0, dx = 0, dy = 0;
        switch (zoomEffect) {
            case 'zoom-in': scale = 1.0 + progress * 0.1; break;
            case 'zoom-out': scale = 1.1 - progress * 0.1; break;
            case 'pan':
                scale = 1.15;
                dx = (progress - 0.5) * width * 0.04;
                dy = (progress - 0.5) * height * 0.04;
                break;
        }
        
        const imgRatio = img.width / img.height;
        const canvasRatio = width / height;
        let baseWidth, baseHeight;

        if (imgRatio > canvasRatio) { // Image is wider than canvas
            baseHeight = height;
            baseWidth = baseHeight * imgRatio;
        } else { // Image is taller or same aspect ratio
            baseWidth = width;
            baseHeight = baseWidth / imgRatio;
        }
        
        const finalWidth = baseWidth * scale;
        const finalHeight = baseHeight * scale;
        const renderX = (width - finalWidth) / 2 + dx;
        const renderY = (height - finalHeight) / 2 + dy;
        ctx.drawImage(img, renderX, renderY, finalWidth, finalHeight);

        const subtitle = subtitles.find(s => currentTime >= s.start && currentTime <= s.end);
        if (subtitle) {
            ctx.font = 'bold 36px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'white';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            const maxWidth = width * 0.9;
            const words = subtitle.text.split(' ');
            let line = '', lines = [];
            for (const word of words) {
                const testLine = line + word + ' ';
                if (ctx.measureText(testLine).width > maxWidth && line !== '') {
                    lines.push(line);
                    line = word + ' ';
                } else {
                    line = testLine;
                }
            }
            lines.push(line);
            
            const lineHeight = 48;
            const startY = height - (lines.length * lineHeight) - (height * 0.05);
            lines.forEach((l, i) => ctx.fillText(l.trim(), width / 2, startY + i * lineHeight));
        }
    }, [duration, zoomEffect, subtitles]);
    
    const handleExport = async () => {
        if (!isReadyForPreview || !canvasRef.current || !audioRef.current) return;
        stopPreview();
        setIsExporting(true);
        setExportProgress(0);

        const canvas = canvasRef.current;
        const audioEl = audioRef.current;
        const musicEl = musicRef.current;
        const totalDuration = audioEl.duration;
        
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            alert('Error: No se pudo inicializar el motor de renderizado.');
            setIsExporting(false);
            return;
        }

        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const destinationNode = audioCtx.createMediaStreamDestination();

        // Narration source
        const narrationSource = audioCtx.createMediaElementSource(audioEl);
        narrationSource.connect(destinationNode);
        
        // Music source with volume control
        if (musicEl && music) {
            const musicSource = audioCtx.createMediaElementSource(musicEl);
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = musicVolume;
            musicSource.connect(gainNode);
            gainNode.connect(destinationNode);
        }

        const videoStream = canvas.captureStream(30);
        const combinedStream = new MediaStream([
            ...videoStream.getVideoTracks(),
            ...destinationNode.stream.getAudioTracks(),
        ]);

        const chunks: Blob[] = [];
        const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm; codecs=vp9,opus' });

        recorder.ondataavailable = e => e.data.size > 0 && chunks.push(e.data);
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'video_creado.webm';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setIsExporting(false);
            audioCtx.close();
        };

        const imageElements = await Promise.all(
            imageUrls.map(url => new Promise<HTMLImageElement>((res, rej) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => res(img);
                img.onerror = rej;
                img.src = url;
            }))
        );

        recorder.start();
        audioEl.currentTime = 0;
        audioEl.play().catch(console.error);
        if (musicEl) {
            musicEl.currentTime = 0;
            musicEl.play().catch(console.error);
        }
        
        const render = () => {
            const elapsed = audioEl.currentTime;
            if (elapsed < totalDuration && recorder.state === 'recording') {
                setExportProgress(Math.round((elapsed / totalDuration) * 100));
                drawCanvasFrame(ctx, elapsed, imageElements);
                animationFrameRef.current = requestAnimationFrame(render);
            } else {
                if (recorder.state === 'recording') {
                    setExportProgress(100);
                    recorder.stop();
                }
                if (audioEl) audioEl.pause();
                if (musicEl) musicEl.pause();
                if(animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            }
        };
        animationFrameRef.current = requestAnimationFrame(render);
    };

    return (
        <div className="app-container">
            <div className="controls-panel">
                <div className="card">
                     <h1>Creador de Videos</h1>
                </div>

                <div className="card">
                    <h2 className="card-header">1. Cargar Archivos</h2>
                    <div className="file-input-group">
                        <label htmlFor="image-upload" className="file-input-wrapper">
                            <span>{images.length > 0 ? `${images.length} imágenes cargadas` : 'Seleccionar Imágenes'}</span>
                            <input id="image-upload" type="file" accept="image/*" multiple onChange={handleImageUpload} disabled={isExporting} />
                        </label>
                        <label htmlFor="audio-upload" className="file-input-wrapper">
                            <span>{audio ? audio.name : 'Seleccionar Audio de Narración'}</span>
                            <input id="audio-upload" type="file" accept="audio/*" onChange={handleAudioUpload} disabled={isExporting} />
                        </label>
                         <label htmlFor="music-upload" className="file-input-wrapper">
                            <span>{music ? music.name : 'Seleccionar Música de Fondo'}</span>
                            <input id="music-upload" type="file" accept="audio/*" onChange={handleMusicUpload} disabled={isExporting} />
                        </label>
                        <label htmlFor="srt-upload" className="file-input-wrapper">
                           <span>{srtFileName || 'Seleccionar Subtítulos (.srt)'}</span>
                           <input id="srt-upload" type="file" accept=".srt" onChange={handleSrtUpload} disabled={isExporting} />
                        </label>
                    </div>
                </div>

                <div className="card">
                    <h2 className="card-header">2. Configuración</h2>
                    <div className="settings-grid">
                        <div className="setting">
                            <label htmlFor="duration">Duración por imagen (segundos):</label>
                            <input id="duration" type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min="1" max="30" disabled={isExporting} />
                        </div>
                        <div className="setting">
                            <label htmlFor="zoom-effect">Efecto Visual:</label>
                            <select id="zoom-effect" value={zoomEffect} onChange={e => setZoomEffect(e.target.value as ZoomEffect)} disabled={isExporting}>
                                <option value="zoom-in">Acercar (Zoom In)</option>
                                <option value="zoom-out">Alejar (Zoom Out)</option>
                                <option value="pan">Paneo (Pan)</option>
                                <option value="none">Ninguno</option>
                            </select>
                        </div>
                        <div className="setting">
                            <label htmlFor="music-volume">Volumen de la Música:</label>
                             <div className="volume-control">
                                <input id="music-volume" type="range" min="0" max="1" step="0.05" value={musicVolume} onChange={e => setMusicVolume(Number(e.target.value))} disabled={!music || isExporting} />
                                <span>{Math.round(musicVolume * 100)}%</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="action-buttons">
                        <button className="btn btn-primary" onClick={isPreviewing ? stopPreview : startPreview} disabled={!isReadyForPreview || isExporting}>
                            {isPreviewing ? 'Detener' : 'Previsualizar'}
                        </button>
                        <button className="btn btn-secondary" onClick={handleReset} disabled={isExporting}>
                            Reiniciar
                        </button>
                        <div className="btn-export-wrapper">
                             <button className="btn btn-success" onClick={handleExport} disabled={!isReadyForPreview || isExporting}>
                                {isExporting ? `Exportando... ${exportProgress}%` : 'Exportar Video'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="preview-panel">
                 <h2>Previsualización</h2>
                <div className="preview-area" aria-label="Área de previsualización de video">
                    {isExporting && (
                         <div className="export-overlay">
                            <div className="progress-bar">
                               <div className="progress-bar-inner" style={{ width: `${exportProgress}%` }}></div>
                            </div>
                            <span>Exportando... {exportProgress}%</span>
                        </div>
                    )}
                    {!isReadyForPreview && <span>Sube imágenes y audio de narración para comenzar.</span>}
                    {isReadyForPreview && imageUrls.map((url, index) => (
                        <img
                            key={index}
                            src={url}
                            alt={`Vista previa de imagen ${index + 1}`}
                            className={`preview-image ${index === currentImageIndex ? `active ${isPreviewing ? zoomEffect : ''}` : ''}`}
                            style={isPreviewing ? { animationDuration: `${duration}s` } : {}}
                        />
                    ))}
                    {currentSubtitle && <div className="subtitles">{currentSubtitle}</div>}
                </div>
                {audioUrl && <audio ref={audioRef} src={audioUrl} />}
                {musicUrl && <audio ref={musicRef} src={musicUrl} loop />}
                <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
            </div>
        </div>
    );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);