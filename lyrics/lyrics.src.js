// Lyrics, one line per sung phrase, in order (as supplied). No timings: analysis/align.py finds every
// syllable in the recording. Each syllable is a karaoke "word". Lines starting with "~" are backing
// vocals (echoes sung under or right after the lead): they are aligned too but staged as echoes.
const LY = [
  // [Verse]
  "Rót đến tràn ly anh chìm đắm trong men cay đắng nồng",
  "~đắng nồng",
  "Khóc chát làn mi uống cùng anh cho đêm này say chất ngất",
  "Dẫu năm tháng ấy còn đâu những đam mê ta kiếm tìm",
  "Màu mắt xanh ngời lạc giữa mây ngàn về chốn xa xôi",
  // [Pre-chorus]
  "Hãy say cùng anh hãy hát cùng anh hãy khóc cùng anh",
  "Thêm một lần",
  "Để anh được gần trái tim của em dù trong phút giây",
  "Hình bóng người tan biến dần phía sau những nỗi sầu",
  "Với em chắc quá đủ cho một mối tình",
  // [Chorus 1]
  "Dẫu em không thể ở lại với anh",
  "Mình chẳng cùng với nhau đi hết quãng đường ôm ấp hi vọng một ngày ngát xanh",
  "Tháng năm thăng trầm dòng đời ngả nghiêng",
  "Mình tự rời bỏ nhau say đến điên dại say hết kiếp người say cho cháy lòng",
  "Hãy say cùng anh",
  "Hãy hát cùng anh",
  // [Chorus 2]
  "Dẫu em không thể ở lại với anh",
  "Mình chẳng cùng với nhau đi hết quãng đường ôm ấp hi vọng một ngày ngát xanh",
  "Tháng năm thăng trầm dòng đời ngả nghiêng",
  "Mình tự rời bỏ nhau say đến điên dại say hết kiếp người say cho cháy lòng",
  "Hãy say cùng anh",
  "Hãy bước cùng anh",
  "~anh say anh bay",
  // [Chorus 3]
  "Dẫu em không thể ở lại với anh",
  "Mình chẳng cùng với nhau đi hết quãng đường ôm ấp hi vọng một ngày ngát xanh",
  "Tháng năm thăng trầm dòng đời ngả nghiêng",
  "Mình tự rời bỏ nhau say đến điên dại say hết kiếp người say cho cháy lòng",
];

if (typeof module !== 'undefined') module.exports = { LY };
