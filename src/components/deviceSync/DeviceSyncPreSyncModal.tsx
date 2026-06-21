import { useTranslation } from 'react-i18next';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { SyncDelta } from '../../utils/deviceSync/runDeviceSyncExecution';
import { formatMb } from '../../utils/format/formatBytes';
import Modal from '../Modal';

interface Props {
  preSyncOpen: boolean;
  preSyncLoading: boolean;
  syncDelta: SyncDelta;
  onCancel: () => void;
  onProceed: () => void;
}

export default function DeviceSyncPreSyncModal({
  preSyncOpen, preSyncLoading, syncDelta, onCancel, onProceed,
}: Props) {
  const { t } = useTranslation();
  const overBudget = syncDelta.addBytes > syncDelta.availableBytes + syncDelta.delBytes;

  return (
    <Modal
      open={preSyncOpen}
      onClose={onCancel}
      title={t('deviceSync.syncSummary')}
      size="md"
      closeLabel={t('deviceSync.cancel')}
      bodyClassName="ui-modal-body--padded"
      footer={!preSyncLoading ? (
        <>
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('deviceSync.cancel')}
          </button>
          <button className="btn btn-primary" onClick={onProceed} disabled={overBudget}>
            {t('deviceSync.proceed')}
          </button>
        </>
      ) : undefined}
    >
      {preSyncLoading ? (
        <div className="device-sync-loading-modal" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '20px' }}>
          <Loader2 size={32} className="spin" />
          <p style={{ marginTop: '10px' }}>{t('deviceSync.calculating')}</p>
        </div>
      ) : (
        <div className="device-sync-summary-stats" style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '10px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span>{t('deviceSync.filesToAdd')}</span>
            <span className="color-success">+{syncDelta.addCount} ({formatMb(syncDelta.addBytes)})</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span>{t('deviceSync.filesToDelete')}</span>
            <span className="color-error">-{syncDelta.delCount} ({formatMb(syncDelta.delBytes)})</span>
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>{t('deviceSync.netChange')}</span>
            <span>{formatMb(syncDelta.addBytes - syncDelta.delBytes)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: overBudget ? 'var(--danger)' : 'inherit', marginTop: '10px' }}>
            <span>{t('deviceSync.availableSpace')}</span>
            <span>{formatMb(syncDelta.availableBytes)}</span>
          </div>
          {overBudget && (
            <div className="sync-warning error" style={{ background: 'color-mix(in srgb, var(--danger) 15%, transparent)', padding: '10px', borderRadius: 'var(--radius-md)', marginTop: '15px', display: 'flex', gap: '10px', color: 'var(--danger)', alignItems: 'flex-start' }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{t('deviceSync.spaceWarning')}</span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
