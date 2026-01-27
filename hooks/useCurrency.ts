import { useCurrencyContext } from "@/context/CurrencyContext";
import { useCallback } from "react";

export const useCurrency = () => {
    const { currency, setCurrency, currencySymbol, exchangeRate, formatCurrency } = useCurrencyContext();

    const convertPrice = useCallback((value: number) => {
        return value * exchangeRate;
    }, [exchangeRate]);

    return {
        currency,
        setCurrency,
        currencySymbol,
        exchangeRate,
        formatCurrency,
        convertPrice,
    };
};
