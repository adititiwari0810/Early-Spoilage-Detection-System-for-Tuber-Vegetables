import React, { useState, useEffect } from 'react';
import { fetchNodes, createNode, updateNode } from '../api';
import toast from 'react-hot-toast';

const Nodes = () => {
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [formData, setFormData] = useState({ node_id: '', name: '', location: '' });

  const loadNodes = async () => {
    try {
      const data = await fetchNodes();
      setNodes(data);
    } catch (err) {
      toast.error('Failed to load nodes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNodes();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingNode) {
        await updateNode(editingNode.id, {
          name: formData.name,
          location: formData.location,
        });
        toast.success('Node updated');
      } else {
        if (!formData.node_id) {
          toast.error('Node ID is required');
          return;
        }
        await createNode(formData);
        toast.success('Node registered');
      }
      setShowForm(false);
      setEditingNode(null);
      setFormData({ node_id: '', name: '', location: '' });
      await loadNodes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Operation failed');
    }
  };

  const startEdit = (node) => {
    setEditingNode(node);
    setFormData({
      node_id: node.node_id,
      name: node.name || '',
      location: node.location || '',
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingNode(null);
    setFormData({ node_id: '', name: '', location: '' });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return '#10B981';
      case 'offline': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'Low': return '#10B981';
      case 'Medium': return '#F59E0B';
      case 'High': return '#EF4444';
      default: return '#6B7280';
    }
  };

  return (
    <div className="nodes-page" id="nodes-page">
      <div className="page-header">
        <h2>🔌 Sensor Nodes</h2>
        <button
          className="btn-primary"
          onClick={() => { setShowForm(!showForm); setEditingNode(null); }}
          id="add-node-btn"
        >
          {showForm ? 'Cancel' : '+ Add Node'}
        </button>
      </div>

      {showForm && (
        <form className="node-form glass-card" onSubmit={handleSubmit} id="node-form">
          <h3>{editingNode ? 'Edit Node' : 'Register New Node'}</h3>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="node-id-input">Node ID</label>
              <input
                id="node-id-input"
                type="text"
                value={formData.node_id}
                onChange={(e) => setFormData({ ...formData, node_id: e.target.value })}
                placeholder="e.g. potato_node_04"
                disabled={!!editingNode}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="node-name-input">Name</label>
              <input
                id="node-name-input"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Storage Room D"
              />
            </div>
            <div className="form-group">
              <label htmlFor="node-location-input">Location</label>
              <input
                id="node-location-input"
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g. Building 2, Floor 1"
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={cancelForm}>Cancel</button>
            <button type="submit" className="btn-primary">{editingNode ? 'Update' : 'Register'}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading nodes...</p>
        </div>
      ) : nodes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔌</div>
          <h3>No Nodes Registered</h3>
          <p>Nodes will be auto-registered when they start sending data, or you can add them manually.</p>
        </div>
      ) : (
        <div className="nodes-grid" id="nodes-grid">
          {nodes.map((node) => (
            <div key={node.id} className="node-card glass-card" id={`node-card-${node.node_id}`}>
              <div className="node-card-header">
                <div className="node-status-wrapper">
                  <span
                    className="node-status-dot"
                    style={{ background: getStatusColor(node.status) }}
                  ></span>
                  <span className="node-status-text">{node.status || 'unknown'}</span>
                </div>
                <button
                  className="node-edit-btn"
                  onClick={() => startEdit(node)}
                  aria-label="Edit node"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              </div>

              <div className="node-card-body">
                <h3 className="node-name">{node.name || node.node_id}</h3>
                <p className="node-id">{node.node_id}</p>
                {node.location && <p className="node-location">📍 {node.location}</p>}
              </div>

              <div className="node-card-footer">
                <div className="node-meta">
                  <span className="node-meta-label">Last Seen</span>
                  <span className="node-meta-value">
                    {node.last_seen
                      ? new Date(node.last_seen).toLocaleString()
                      : 'Never'}
                  </span>
                </div>
                {node.latest_score !== null && node.latest_score !== undefined && (
                  <div className="node-meta">
                    <span className="node-meta-label">Spoilage</span>
                    <span
                      className="node-meta-value"
                      style={{ color: getRiskColor(node.latest_risk) }}
                    >
                      {(node.latest_score * 100).toFixed(1)}% ({node.latest_risk})
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Nodes;
