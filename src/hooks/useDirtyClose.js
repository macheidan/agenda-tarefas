import { useCallback, useEffect, useRef } from 'react';

/**
 * Pede confirmação ao usuário antes de fechar quando há alterações não salvas.
 *
 * @param {boolean} isDirty - true se o formulário foi modificado
 * @param {() => void} onClose - função real de fechar o modal
 * @param {string} [message] - texto do confirm
 * @returns {() => boolean} tryClose — chama em vez de onClose; retorna true se fechou
 */
export function useDirtyClose(
  isDirty,
  onClose,
  message = 'Você tem alterações não salvas. Deseja sair sem salvar?'
) {
  const dirtyRef = useRef(isDirty);
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  const tryClose = useCallback(() => {
    if (dirtyRef.current && !window.confirm(message)) return false;
    onClose();
    return true;
  }, [onClose, message]);

  // Avisa antes de fechar a aba/recarregar enquanto há mudanças pendentes
  useEffect(() => {
    if (!isDirty) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  return tryClose;
}

/**
 * Compara form com initial via JSON.stringify e devolve boolean.
 * Útil pra alimentar o `isDirty` do useDirtyClose.
 */
export function isFormDirty(form, initial) {
  try {
    return JSON.stringify(form) !== JSON.stringify(initial);
  } catch {
    return false;
  }
}
