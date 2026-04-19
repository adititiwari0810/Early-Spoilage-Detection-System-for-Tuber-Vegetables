import React, { useState, useEffect } from 'react';
import { fetchAlerts, dismissAlert } from '../api';
import toast from 'react-hot-toast';

const AlertBanner = ({ onAlertReceived }) => {
  const [alerts, setAlerts] = useState([]);
  const [expanded, setExpanded] = useState(false);

  // Load initial alerts
  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const data = await fetchAlerts();
        setAlerts(data.slice(0, 20));
      } catch (err) {
        // Silently fail on initial load
      }
    };
    loadAlerts();
  }, []);

  // Listen for new alerts via callback
  useEffect(() => {
    if (onAlertReceived) {
      onAlertReceived((alert) => {
        setAlerts((prev) => [alert, ...prev].slice(0, 20));
        toast.error(alert.message, { duration: 6000 });
      });
    }
  }, [onAlertReceived]);

  const handleDismiss = async (id) => {
    try {
      await dismissAlert(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      toast.success('Alert dismissed');
    } catch (err) {
      toast.error('Failed to dismiss alert');
    }
  };

  const criticalAlerts = alerts.filter((a) => a.level === 'critical');
  const warningAlerts = alerts.filter((a) => a.level === 'warning');

  if (alerts.length === 0) return null;

  return (
    <div className={`alert-banner ${criticalAlerts.length > 0 ? 'has-critical' : 'has-warning'}`} id="alert-banner">
      <div className="alert-banner-header" onClick={() => setExpanded(!expanded)}>
        <div className="alert-summary">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>
            {criticalAlerts.length > 0 && <strong>{criticalAlerts.length} critical</strong>}
            {criticalAlerts.length > 0 && warningAlerts.length > 0 && ' · '}
            {warningAlerts.length > 0 && <span>{warningAlerts.length} warnings</span>}
          </span>
        </div>
        <button className="alert-toggle" aria-label="Toggle alerts">
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="alert-list">
          {alerts.map((alert) => (
            <div key={alert.id} className={`alert-item alert-${alert.level}`}>
              <div className="alert-content">
                <span className={`alert-badge ${alert.level}`}>{alert.level.toUpperCase()}</span>
                <span className="alert-message">{alert.message}</span>
                <span className="alert-time">
                  {new Date(alert.created_at).toLocaleTimeString()}
                </span>
              </div>
              <button
                className="alert-dismiss"
                onClick={(e) => { e.stopPropagation(); handleDismiss(alert.id); }}
                aria-label="Dismiss alert"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlertBanner;
