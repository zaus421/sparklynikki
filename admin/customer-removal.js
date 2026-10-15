(() => {
  'use strict';
  const pending = new Set();
  window.SPARKLY_CUSTOMER_REMOVAL = {
    busy: id => pending.has(String(id)),
    async remove({ id, name, dialog, error }) {
      id = String(id || '');
      if (!id || pending.has(id)) return;
      if (!confirm(`Remove ${name || 'this customer'} from Leads / CRM and Operations → Customers? Historical jobs, quotes, payments, schedules and reminders will be kept.`)) return;
      pending.add(id);
      error.textContent = '';
      const controls = [...dialog.querySelectorAll('button, input, select, textarea')];
      const disabled = controls.map(control => control.disabled);
      controls.forEach(control => { control.disabled = true; });
      const preventClose = event => event.preventDefault();
      dialog.addEventListener('cancel', preventClose);
      try {
        const base = String(window.SPARKLY_ADMIN_CONFIG?.apiBase || '').replace(/\/$/, '');
        const response = await fetch(`${base}/api/leads/${encodeURIComponent(id)}`, {
          method: 'DELETE', mode: 'cors',
          headers: { Authorization: `Bearer ${sessionStorage.getItem('sn_admin_token') || ''}` }
        });
        let result;
        try { result = await response.json(); } catch (_) {}
        if (!response.ok || result?.ok !== true) {
          throw new Error(response.status === 401 ? 'Your session expired. Sign in again.' : result?.error || `Removal failed (${response.status}). Please try again.`);
        }
        dialog.close();
        document.dispatchEvent(new CustomEvent('customer-removed', { detail: { id } }));
      } catch (failure) {
        error.textContent = failure.message || 'Unable to remove customer. Please try again.';
      } finally {
        controls.forEach((control, index) => { control.disabled = disabled[index]; });
        dialog.removeEventListener('cancel', preventClose);
        pending.delete(id);
      }
    }
  };
})();
