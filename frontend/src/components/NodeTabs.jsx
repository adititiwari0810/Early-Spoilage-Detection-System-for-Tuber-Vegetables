import React from 'react';

const NodeTabs = ({ nodeIds, activeNode, onSelectNode }) => {
  if (nodeIds.length === 0) {
    return (
      <div className="node-tabs" id="node-tabs">
        <div className="node-tabs-empty">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>Waiting for sensor nodes...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="node-tabs" id="node-tabs">
      <div className="node-tabs-label">Nodes:</div>
      <div className="node-tabs-list">
        {nodeIds.map((nodeId) => (
          <button
            key={nodeId}
            className={`node-tab ${activeNode === nodeId ? 'active' : ''}`}
            onClick={() => onSelectNode(nodeId)}
            id={`node-tab-${nodeId}`}
          >
            <span className="node-tab-dot"></span>
            <span className="node-tab-name">{nodeId.replace('potato_node_', 'Node ')}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default NodeTabs;
