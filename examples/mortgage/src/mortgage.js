import differenceInDays from 'date-fns/difference_in_days'
import xcell, { Cell } from 'xcell'

import {
  getInstallmentDate,
  getInstallmentInterest,
  getMonthlyPayment,
  minus,
  plus,
  sum,
} from "./utils";

class Installment {
  dispose() {
    for (let key in this) {
      if (this[key] instanceof Cell) {
        this[key].dispose();
      }
    }
  }
}

export function createStore({ loanAmount, rate, loanDate, loanTermYears = 30 }) {
  const $rate = xcell(rate)
  const $loanAmount = xcell(loanAmount)
  const $loanTermYears = xcell(loanTermYears)
  const $loanTermMonths = xcell([$loanTermYears], x => x * 12)
  const $loanDate = xcell(loanDate)

  const $installments = xcell(
    [$loanTermMonths, $loanDate, $loanAmount],
    ( loanTermMonths,  loanDate,  loanAmount) => {
      const result = []

      if (!loanDate || !(loanAmount > 0)) {
        return result;
      }

      let prev;

      for (let i = 0; i < loanTermMonths; i++) {
        void function makeInstallment(idx) {
          const remaining = loanTermMonths - idx;

          const $date = xcell([$loanDate], d => getInstallmentDate(d, idx))
          const $paid = prev
            ? xcell([prev.$paid, prev.$principal], plus)
            : xcell(0)
          const $debt = xcell([$loanAmount, $paid], minus)
          const $amount = xcell([$debt, $rate], (debt, rate) => getMonthlyPayment(debt, remaining, rate))
          const $interestDays = xcell([
            $date,
            prev ? prev.$date : $loanDate
          ], differenceInDays)
          const $interest = xcell([$debt, $rate, $interestDays], getInstallmentInterest)
          const $principal = xcell([$amount, $interest], minus)

          const installment = new Installment()
          Object.assign(installment, {
            idx,
            $date,
            $interestDays,
            $debt,
            $paid,
            $interest,
            $principal,
            $amount,
          })

          result.push(installment)
          prev = installment;
        }(i)
      }

      return result;
    }
  )

  // cleanup
  $installments.on('change', (_, previous) => {
    for (let installment of previous) {
      installment.dispose();
    }
  })

  // dynamic ranges
  const $interestRange = xcell([$installments], installments =>
    installments.map(i => i.$interest)
  )
  const $interestSum = xcell($interestRange.value, sum)
  $interestRange.on('change', ({ value }) => {
    $interestSum.dependencies = value
  })

  const $amountRange = xcell([$installments], installments =>
    installments.map(i => i.$amount)
  )
  const $amountSum = xcell($amountRange.value, sum)
  $amountRange.on('change', ({ value }) => {
    $amountSum.dependencies = value
  })

  return {
    $rate,
    $loanAmount,
    $loanTermYears,
    $loanTermMonths,
    $loanDate,
    $installments,
    $interestSum,
    $amountSum,
  }
}
