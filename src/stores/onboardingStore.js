/**
 * ============================================================================
 * LeanPrompts Studio
 * @author       Ivica Vrgoc
 * @link         https://github.com/IvicaV/LeanPrompts
 * @copyright    Copyright (c) 2025-present Ivica Vrgoc. All rights reserved.
 * @license      AGPL-3.0
 * ============================================================================
 * This file is part of LeanPrompts Studio.
 * 
 * LeanPrompts Studio is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 * ============================================================================
 */
import { create } from 'zustand';

const useOnboardingStore = create((set, get) => ({
    hasCompletedPopupOnboarding: false,
    hasCompletedDashboardOnboarding: false,
    isTourActive: false,
    currentStep: 0,
    tourType: null, // 'popup' or 'dashboard'

    loadOnboardingStatus: async () => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const data = await chrome.storage.local.get([
                'lp_onboarding_popup_done',
                'lp_onboarding_dashboard_done'
            ]);
            set({
                hasCompletedPopupOnboarding: !!data.lp_onboarding_popup_done,
                hasCompletedDashboardOnboarding: !!data.lp_onboarding_dashboard_done
            });
        }
    },

    startTour: (type) => {
        set({
            isTourActive: true,
            currentStep: 0,
            tourType: type
        });
    },

    resetTour: async (type) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const key = type === 'popup' ? 'lp_onboarding_popup_done' : 'lp_onboarding_dashboard_done';
            await chrome.storage.local.remove(key);
        }

        if (type === 'popup') {
            set({ hasCompletedPopupOnboarding: false, isTourActive: true, currentStep: 0, tourType: 'popup' });
            // Attempt to open popup programmatically
            if (typeof chrome !== 'undefined' && chrome.action && chrome.action.openPopup) {
                chrome.action.openPopup().catch(() => {
                    // Fail silently or handle if needed
                });
            }
        } else {
            set({ hasCompletedDashboardOnboarding: false, isTourActive: true, currentStep: 0, tourType: 'dashboard' });
        }
    },

    nextStep: () => {
        set(state => ({ currentStep: state.currentStep + 1 }));
    },

    prevStep: () => {
        set(state => ({ currentStep: Math.max(0, state.currentStep - 1) }));
    },

    completeTour: async () => {
        const { tourType } = get();
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const key = tourType === 'popup' ? 'lp_onboarding_popup_done' : 'lp_onboarding_dashboard_done';
            await chrome.storage.local.set({ [key]: true });
        }

        if (tourType === 'popup') {
            set({ hasCompletedPopupOnboarding: true, isTourActive: false, currentStep: 0 });
        } else {
            set({ hasCompletedDashboardOnboarding: true, isTourActive: false, currentStep: 0 });
        }
    },

    skipTour: async () => {
        const { tourType } = get();
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const key = tourType === 'popup' ? 'lp_onboarding_popup_done' : 'lp_onboarding_dashboard_done';
            await chrome.storage.local.set({ [key]: true });
        }

        if (tourType === 'popup') {
            set({ hasCompletedPopupOnboarding: true, isTourActive: false, currentStep: 0 });
        } else {
            set({ hasCompletedDashboardOnboarding: true, isTourActive: false, currentStep: 0 });
        }
    }
}));

export default useOnboardingStore;
