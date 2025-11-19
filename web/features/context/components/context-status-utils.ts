export function getStatusColor(status: string, stage?: string | null, blueprintStatus?: string | null): string {
  if (status === 'error') return '#ef4444'; // red
  if (status === 'ended') return '#64748b'; // gray
  if (status === 'paused') return '#f59e0b'; // amber
  if (status === 'active') {
    return stage === 'running' ? '#3b82f6' : stage === 'testing' ? '#8b5cf6' : '#3b82f6'; // blue/purple
  }
  if (status === 'idle') {
    switch (stage) {
      case 'blueprint':
        // Blueprint phase: use blueprint status for color
        if (blueprintStatus === 'generating') return '#3b82f6'; // blue - generating
        if (blueprintStatus === 'ready') return '#f59e0b'; // amber - awaiting approval
        if (blueprintStatus === 'approved') return '#10b981'; // green - approved
        if (blueprintStatus === 'error') return '#ef4444'; // red - error
        return '#8b5cf6'; // purple - default blueprint state
      case 'blueprint_generating':
        return '#3b82f6'; // blue - actively generating
      case 'researching': return '#f59e0b'; // amber
      case 'building_glossary': return '#f59e0b'; // amber
      case 'building_chunks': return '#f59e0b'; // amber
      case 'regenerating_research': return '#f59e0b'; // amber
      case 'regenerating_glossary': return '#f59e0b'; // amber
      case 'regenerating_chunks': return '#f59e0b'; // amber
      case 'context_complete': return '#10b981'; // green
      case 'testing': return '#8b5cf6'; // purple
      default: return '#64748b'; // gray
    }
  }
  return '#6b7280';
}

export function getStatusLabel(status: string, stage?: string | null, blueprintStatus?: string | null): string {
  if (status === 'error') return 'Error';
  if (status === 'ended') return 'Ended';
  if (status === 'paused') return 'Paused';
  if (status === 'active') {
    return stage === 'running' ? 'Running' : stage === 'testing' ? 'Testing' : 'Active';
  }
  if (status === 'idle') {
    switch (stage) {
      case 'blueprint':
        // Enhanced blueprint phase labels based on blueprint status
        if (!blueprintStatus) return 'Waiting for Blueprint';
        if (blueprintStatus === 'generating') return 'Generating Blueprint';
        if (blueprintStatus === 'ready') return 'Blueprint Ready';
        if (blueprintStatus === 'approved') return 'Blueprint Approved';
        if (blueprintStatus === 'error') return 'Blueprint Error';
        return 'Blueprint';
      case 'blueprint_generating':
        return 'Generating Blueprint';
      case 'researching': return 'Researching';
      case 'building_glossary': return 'Building Glossary';
      case 'building_chunks': return 'Building Chunks';
      case 'regenerating_research': return 'Regenerating Research';
      case 'regenerating_glossary': return 'Regenerating Glossary';
      case 'regenerating_chunks': return 'Regenerating Chunks';
      case 'context_complete': return 'Context Complete';
      case 'testing': return 'Testing';
      default: return 'Idle';
    }
  }
  return 'Unknown';
}

