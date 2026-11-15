#!/usr/bin/env bash
# End-to-end API checks against production.
B=${B:-https://94-131-95-178.sslip.io/api}
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 (got $2, want $3)"; fail=$((fail+1)); fi; }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
j() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1]))" "$1"; }

check health "$(curl -s $B/health | j 'd["status"]')" ok
check states "$(curl -s $B/meta/states | j 'len([s for s in d["states"] if s["supported"]])')" 5
check sources "$(curl -s $B/meta/sources | j 'len(d["sources"])>10')" True
TOK=$(curl -s -XPOST $B/sessions | j 'd["token"]'); H="Authorization: Bearer $TOK"
check no_auth "$(code $B/sessions/me)" 401
CID=$(curl -s -XPOST -H "$H" $B/cases/sample | j 'd["caseId"]')
S=$(curl -s -H "$H" $B/cases/$CID/summary)
check summary_cobra "$(echo "$S" | j 'd["insurance"]["cobraMonthly"]')" 2406
check summary_free_fields "$(echo "$S" | j 'len(d["upcoming"])>0 and d["unemployment"]["weeklyBenefit"]>0 and len(d["acaQuotes"])>0')" True
check plan_locked "$(code -H "$H" $B/cases/$CID/plan)" 402
check checkin_locked "$(code -H "$H" $B/cases/$CID/checkins)" 402
check bad_card "$(code -XPOST -H "$H" -d "{\"caseId\":\"$CID\",\"card\":\"4000000000000002\",\"expiry\":\"12/30\",\"cvc\":\"123\"}" $B/billing/test-checkout)" 402
R=$(curl -s -XPOST -H "$H" -d "{\"caseId\":\"$CID\",\"card\":\"4242 4242 4242 4242\",\"expiry\":\"12 / 30\",\"cvc\":\"123\"}" $B/billing/test-checkout); check test_pay "$(echo "$R" | j 'd["paid"]')" True
check plan_open "$(code -H "$H" $B/cases/$CID/plan)" 200
check status_paid "$(curl -s -H "$H" $B/billing/status/$CID | j 'd["paid"]')" True
check advance "$(code -XPOST -H "$H" -d '{"weeks":1}' $B/cases/$CID/demo/advance)" 200
WK=$(curl -s -H "$H" $B/cases/$CID/checkins | j 'd["currentWeek"]')
D=$(python3 -c "import datetime;print((datetime.date.fromisoformat('$WK')+datetime.timedelta(days=1)).isoformat())")
CI=$(curl -s -XPOST -H "$H" -d "{\"weekStart\":\"$WK\",\"activities\":[{\"date\":\"$D\",\"employer\":\"A\",\"position\":\"PM\",\"method\":\"online\",\"contact\":\"x\",\"result\":\"applied\"},{\"date\":\"$D\",\"employer\":\"B\",\"position\":\"PM\",\"method\":\"online\",\"contact\":\"x\",\"result\":\"applied\"},{\"date\":\"$D\",\"employer\":\"C\",\"position\":\"PM\",\"method\":\"online\",\"contact\":\"x\",\"result\":\"applied\"}],\"earnings\":150}" $B/cases/$CID/checkins)
check checkin_compliant "$(echo "$CI" | j 'd["checkin"]["compliant"]')" True
check checkin_csv "$(code -H "$H" $B/cases/$CID/checkins/$WK/record.csv)" 200
check ics "$(curl -s "$B/cases/$CID/calendar.ics?token=$TOK" | grep -c RRULE)" 1
OF=$(curl -s -XPOST -H "$H" -d '{"company":"Globex","salary":130000,"bonus":0,"match401kPct":4,"employeePremiumMonthly":250,"deductible":2000,"startDate":"2027-02-22","coverageStartsAfterDays":30,"currentCoverage":{"type":"aca","monthlyAptc":800,"aptcStartMonth":"2026-12"}}' $B/cases/$CID/offers)
check offer_clawback "$(echo "$OF" | j 'd["result"]["aptcClawback"]["excess"]>0')" True
check tax "$(code -H "$H" $B/cases/$CID/tax-preview)" 200
check explain "$(curl -s -m 60 -XPOST -H "$H" -d '{"topic":"runway"}' $B/cases/$CID/explain | j '"text" in d')" True
check hr_letter "$(curl -s -m 60 -XPOST -H "$H" -d '{"tone":"firm","asks":["cobra_subsidy"]}' $B/cases/$CID/hr-letter | j '"body" in d')" True
check unsupported_state "$(curl -s -XPOST -H "$H" -d '{"state":"NY","household":[{"relation":"self","age":30}],"lastDay":"2026-11-10","coverageEndDate":"2026-11-30","annualSalary":1,"ytdWages":1,"severance":{"gross":0},"insurance":{},"savings":1,"monthlyExpenses":1,"expectedReemployment":{"weeks":10,"salary":1}}' $B/cases | j 'd["error"]["code"]')" unsupported_state
OWN='{"state":"MI","household":[{"relation":"self","age":45},{"relation":"child","age":10}],"lastDay":"2026-11-01","coverageEndDate":"2026-11-30","cobraNoticeDate":null,"annualSalary":70000,"ytdWages":58000,"severance":{"gross":10000},"insurance":{"cobraMonthlyFromLetter":1500,"spousePlanMonthly":null,"fsaBalance":0,"hsaBalance":0},"spouseAnnualIncome":0,"savings":9000,"monthlyExpenses":3500,"has401kLoan":true,"groupLayoff":true,"expectedReemployment":{"weeks":20,"salary":70000}}'
C2=$(curl -s -XPOST -H "$H" -d "$OWN" $B/cases | j 'd["caseId"]')
S2=$(curl -s -H "$H" $B/cases/$C2/summary)
check own_case_different "$(echo "$S2" | j 'd["insurance"]["cobraMonthly"]')" 1500
check own_case_advance_forbidden "$(code -XPOST -H "$H" -d '{"weeks":1}' $B/cases/$C2/demo/advance)" 403
check own_case_unlock_forbidden "$(code -XPOST -H "$H" $B/cases/$C2/demo/unlock)" 403
TOK2=$(curl -s -XPOST $B/sessions | j 'd["token"]')
check other_session_404 "$(code -H "Authorization: Bearer $TOK2" $B/cases/$CID/summary)" 404
check cors "$(curl -s -o /dev/null -D - -H 'Origin: https://sedona-layoff.vercel.app' $B/health | grep -ci access-control-allow-origin)" 1
check frontend "$(code https://sedona-layoff.vercel.app/plan/abc)" 200
echo "passed $pass, failed $fail"
