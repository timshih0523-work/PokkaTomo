<!--
  FortuneCard.vue — 聊天紀錄裡的「今日占卜」卡片（後端 server/fortuneService.js）。
  運勢、幸運色、幸運物、幸運數字用固定格式顯示，下面是角色用自己口吻寫的說明。
-->
<template>
  <div class="fortune-card">
    <p class="fortune-title">🔮 {{ strings.title }}</p>
    <p class="fortune-rank" :class="`rank-${fortune.rank}`">{{ fortune.rankText }}</p>
    <dl class="fortune-luck">
      <div><dt>{{ strings.color }}</dt><dd>{{ fortune.color }}</dd></div>
      <div><dt>{{ strings.item }}</dt><dd>{{ fortune.item }}</dd></div>
      <div><dt>{{ strings.number }}</dt><dd>{{ fortune.number }}</dd></div>
    </dl>
    <p class="fortune-text">{{ fortune.text }}</p>
  </div>
</template>

<script setup>
defineProps({
  fortune: { type: Object, required: true },
  strings: { type: Object, required: true }
});
</script>

<style scoped>
.fortune-card {
  background: linear-gradient(160deg, #fff7e8, #ffe9f2);
  border: 1px solid #f3d6b8;
  border-radius: 16px;
  padding: 10px 14px 12px;
  max-width: 85%;
  align-self: flex-start;
  color: #4a3a2a;
}
.fortune-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.75;
}
.fortune-rank {
  margin: 2px 0 6px;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #d9466f;
}
.rank-daikichi { color: #e0397a; }
.rank-suekichi { color: #a5825a; }
.fortune-luck {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, auto);
  gap: 4px 14px;
  font-size: 12px;
}
.fortune-luck dt { opacity: 0.6; }
.fortune-luck dd { margin: 0; font-weight: 600; }
.fortune-text {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.55;
}
</style>
