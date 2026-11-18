#!/usr/bin/env bash
# 더블클릭하면 터미널이 열리고, 시연 전후의 DB(db/data)를 백업하거나 처음 상태로 되돌린다.
#   1) 지금 DB를 백업해 둔다      (시연 켜기 전에 한 번)
#   2) 백업으로 되돌린다          (시연 끝난 뒤)
#   3) 샘플 문의 10만 건(6개월)으로 다시 만든다 (백업이 없을 때)
# 아무것도 지우지 않는다. 되돌리기 전의 DB는 홈 폴더에 날짜를 붙여 옮겨 둔다.
# 신호 상태 이력도 같은 폴더에 있어서, 되돌리면 시연 중에 바꾼 상태도 처음으로 돌아간다.
# 서버가 켜져 있으면 하지 않는다. 켜 둔 터미널 창에서 Ctrl-C로 먼저 끈다.
# 시험용 환경변수: DATA_DIR(DB 폴더), BACKUP_DIR(백업 폴더), DB_PORT, PROXY_PORT
cd "$(dirname "$0")" || exit 1

DATA_DIR="${DATA_DIR:-db/data}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/mini-react-db-backup}"
DB_PORT="${DB_PORT:-8080}"
PROXY_PORT="${PROXY_PORT:-8001}"
STAMP="$(date +%Y%m%d-%H%M%S)"

finish() {
  echo
  [ -z "${NO_PAUSE:-}" ] && read -r -p "엔터를 누르면 끝납니다. " _
  exit "${1:-0}"
}
say_fail() { echo "오류: $*" >&2; finish 1; }
port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
ask() {  # $1=질문. 'y'일 때만 0
  local a
  read -r -p "$1 [y/N] " a
  [ "$a" = "y" ] || [ "$a" = "Y" ]
}

for p in "$DB_PORT" "$PROXY_PORT"; do
  port_busy "$p" && say_fail "서버가 켜져 있습니다(포트 $p). 켜 둔 터미널 창에서 Ctrl-C로 끈 뒤 다시 여세요."
done

echo "지금 DB:   $DATA_DIR"
echo "백업 위치: $BACKUP_DIR"
echo
echo "  1) 지금 DB를 백업해 둔다 (시연 켜기 전에)"
echo "  2) 백업으로 되돌린다 (시연 끝난 뒤)"
echo "  3) 샘플 문의 10만 건(6개월)으로 다시 만든다"
echo "  그 밖의 키: 아무것도 하지 않고 끝낸다"
read -r -p "번호를 고르세요: " choice
echo

case "$choice" in
  1)
    [ -d "$DATA_DIR" ] || say_fail "$DATA_DIR 가 없습니다. 먼저 서버를 한 번 켜서 DB를 만드세요."
    if [ -e "$BACKUP_DIR" ]; then
      echo "이미 백업이 있습니다: $BACKUP_DIR"
      ask "그 백업을 ${BACKUP_DIR}-old-$STAMP 로 옮기고 새로 백업할까요?" || { echo "그대로 둡니다."; finish 0; }
      mv "$BACKUP_DIR" "${BACKUP_DIR}-old-$STAMP" || say_fail "기존 백업을 옮기지 못했습니다."
    fi
    cp -R "$DATA_DIR" "$BACKUP_DIR" || say_fail "백업하지 못했습니다."
    echo "백업했습니다: $BACKUP_DIR"
    ;;
  2)
    [ -d "$BACKUP_DIR" ] || say_fail "백업이 없습니다($BACKUP_DIR). 먼저 1번으로 백업하세요."
    USED="$HOME/mini-react-db-used-$STAMP"
    if [ -d "$DATA_DIR" ]; then
      mv "$DATA_DIR" "$USED" || say_fail "지금 DB를 옮기지 못했습니다."
      echo "쓰던 DB는 여기로 옮겼습니다: $USED"
    fi
    cp -R "$BACKUP_DIR" "$DATA_DIR" || say_fail "백업을 복사하지 못했습니다. 쓰던 DB는 $USED 에 있습니다."
    echo "백업으로 되돌렸습니다."
    ;;
  3)
    USED="$HOME/mini-react-db-used-$STAMP"
    if [ -d "$DATA_DIR" ]; then
      mv "$DATA_DIR" "$USED" || say_fail "지금 DB를 옮기지 못했습니다."
      echo "쓰던 DB는 여기로 옮겼습니다: $USED"
    fi
    python3 db/load_sample.py --data-dir "$DATA_DIR" || say_fail "다시 만들지 못했습니다. 쓰던 DB는 $USED 에 있습니다."
    echo "샘플 문의로 다시 만들었습니다."
    ;;
  *)
    echo "아무것도 하지 않았습니다."
    ;;
esac
finish 0
