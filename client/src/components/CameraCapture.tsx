import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, RotateCcw, SwitchCamera } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { Button } from './ui';

const MAX_SIDE = 2000; // keeps photos well under the upload and vision-model limits

/** Downscales any image source to a JPEG blob. */
function toJpeg(src: CanvasImageSource, w: number, h: number): Promise<Blob> {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d')!.drawImage(src, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('capture failed'))), 'image/jpeg', 0.88));
}

async function fileToJpeg(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  try {
    return await toJpeg(bmp, bmp.width, bmp.height);
  } finally {
    bmp.close();
  }
}

/**
 * Live camera preview (getUserMedia) with a "take photo" button.
 * Falls back to the device camera / file picker when live video is unavailable
 * (no permission, no camera, or a non-HTTPS origin).
 */
export function CameraCapture({ onCapture }: { onCapture: (photo: Blob) => void }) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [live, setLive] = useState<'starting' | 'on' | 'off'>('starting');
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (preview) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setLive('off');
      return;
    }
    let stream: MediaStream | null = null;
    let cancelled = false;
    setLive('starting');
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((tr) => tr.stop());
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
        }
        setLive('on');
      })
      .catch(() => !cancelled && setLive('off'));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [facing, preview]);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const accept = (blob: Blob) => {
    setPreview(URL.createObjectURL(blob));
    onCapture(blob);
  };
  const snap = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    accept(await toJpeg(v, v.videoWidth, v.videoHeight));
  };
  const pick = async (file: File | undefined) => {
    if (file) accept(await fileToJpeg(file));
  };

  if (preview) {
    return (
      <div className="space-y-2">
        <img src={preview} alt={t('camera.preview')} className="max-h-80 w-full rounded-lg border border-slate-200 bg-black object-contain" />
        <Button size="sm" variant="secondary" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setPreview(null)}>
          {t('camera.retake')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {live !== 'off' && (
        <div className="relative overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
          {live === 'starting' && <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">{t('camera.starting')}</div>}
          {live === 'on' && <div className="pointer-events-none absolute inset-4 rounded-md border-2 border-dashed border-white/40" aria-hidden />}
        </div>
      )}
      {live === 'off' && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{t('camera.unavailable')}</p>}
      <div className="flex flex-wrap gap-2">
        {live === 'on' && (
          <>
            <Button icon={<Camera className="h-4 w-4" />} onClick={snap}>
              {t('camera.snap')}
            </Button>
            <Button variant="ghost" icon={<SwitchCamera className="h-4 w-4" />} onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label={t('camera.switch')} />
          </>
        )}
        <Button variant={live === 'on' ? 'secondary' : 'primary'} icon={<ImagePlus className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
          {t('camera.choose')}
        </Button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
    </div>
  );
}
