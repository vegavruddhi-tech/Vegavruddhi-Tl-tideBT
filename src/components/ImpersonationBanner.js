import React from 'react';
import { Alert, Button } from '@mui/material';

export default function ImpersonationBanner({ isImpersonating, targetName, targetEmail, onExit }) {
  if (!isImpersonating) return null;

  return (
    <Alert 
      severity="info" 
      sx={{ mb: 2, fontWeight: 600, bgcolor: '#f3e5f5', border: '1px solid #ce93d8', color: '#4a148c', display: 'flex', alignItems: 'center' }}
      action={
        <Button 
          variant="contained"
          color="secondary" 
          size="small" 
          onClick={onExit}
          sx={{ fontWeight: 700, bgcolor: '#9c27b0', color: '#fff', '&:hover': { bgcolor: '#7b1fa2' }, textTransform: 'none' }}
        >
          ⬅ Return to Admin Approvals
        </Button>
      }
    >
      👁️ Viewing TL Tide BT Dashboard as <strong>{targetName}</strong> ({targetEmail}) — Admin Mode
    </Alert>
  );
}
