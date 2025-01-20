// 정보 수집 함수 (쿠팡 페이지 내에서 실행)
function scrapeProductInfo() {
  try {
    console.log('정보 수집 시작');
    
    // 상품명 추출
    let name = '';
    const nameElement = document.querySelector('.prod-buy-header__title');
    if (nameElement) {
      name = nameElement.textContent.trim();
      console.log('상품명:', name);
    }

    // 가격 추출
    let price = '';
    const priceElement = document.querySelector('.total-price > strong');
    if (priceElement) {
      price = priceElement.textContent.trim();
      console.log('가격:', price);
    }

    // 리뷰 정보 추출
    let reviews = [];
    const reviewElements = document.querySelectorAll('.sdp-review__article__list');
    
    reviewElements.forEach(review => {
      const reviewText = review.querySelector('.sdp-review__article__list__review');
      // 리뷰 본문이 있는 경우에만 수집
      if (reviewText && reviewText.textContent.trim()) {
        const userName = review.querySelector('.sdp-review__article__list__info__user__name')?.textContent.trim() || '';
        const rating = review.querySelector('.sdp-review__article__list__info__product-info__star-orange')?.innerText.trim() || '';
        const date = review.querySelector('.sdp-review__article__list__info__product-info__reg-date')?.textContent.trim() || '';
        const option = review.querySelector('.sdp-review__article__list__info__product-info__name')?.textContent.trim() || '';
        const quantity = review.querySelector('.sdp-review__article__list__info__product-info__cnt')?.textContent.trim() || '';
        const content = reviewText.textContent.trim();

        reviews.push({
          userName,
          rating,
          date,
          option,
          quantity,
          content
        });
      }
    });

    // 모든 섬네일 이미지 URL 추출
    let imageUrls = [];
    const imageElements = document.querySelectorAll('.prod-image__item img');
    console.log('찾은 이미지 요소 수:', imageElements.length);
    
    imageElements.forEach((img, index) => {
      let imageUrl = img.src;
      if (imageUrl) {
        imageUrl = imageUrl.replace(/\/\d+x\d+(?:ex)?\//, '/492x492ex/');
        imageUrls.push(imageUrl);
        console.log(`이미지 ${index + 1} URL:`, imageUrl);
      }
    });

    return {
      name,
      price,
      imageUrls,
      reviews
    };
  } catch (error) {
    console.error('정보 수집 중 오류:', error);
    throw error;
  }
}

// 상품 정보 수집 버튼 이벤트 리스너
document.getElementById('collectInfo').addEventListener('click', async () => {
  try {
    console.log('수집 버튼 클릭됨');
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('현재 탭 URL:', tab.url);
    
    if (!tab.url.includes('coupang.com')) {
      document.getElementById('result').textContent = '쿠팡 상품 페이지가 아닙니다.';
      return;
    }

    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeProductInfo,
    });

    console.log('수집 결과:', result);
    const productInfo = result[0].result;

    if (productInfo) {
      // 이미지 다운로드 처리
      if (productInfo.imageUrls.length > 0) {
        console.log('이미지 다운로드 시작');
        const dateStr = new Date().toISOString().split('T')[0];
        
        const downloadPromises = productInfo.imageUrls.map(async (imageUrl, index) => {
          try {
            console.log(`${index + 1}번 이미지 다운로드 시도:`, imageUrl);
            
            const sanitizedName = productInfo.name
              .replace(/[\\/:*?"<>|]/g, '')
              .replace(/\s+/g, '_')
              .slice(0, 50);

            const downloadId = await chrome.downloads.download({
              url: imageUrl,
              filename: `${dateStr}_${sanitizedName}_${index + 1}.jpg`,
              conflictAction: 'uniquify',
              saveAs: false
            });
            
            console.log(`${index + 1}번 이미지 다운로드 ID:`, downloadId);
            return true;
          } catch (error) {
            console.error(`${index + 1}번 이미지 다운로드 실패:`, error);
            return false;
          }
        });

        await Promise.all(downloadPromises);
      }

      // TSV 형식으로 데이터 포맷팅
      let tsvData = `${productInfo.name}\t${productInfo.price}`;
      
      // 리뷰 데이터 추가
      if (productInfo.reviews.length > 0) {
        productInfo.reviews.forEach(review => {
          // 리뷰 본문의 줄바꿈을 공백으로 변경하고 탭 문자를 제거
          const sanitizedContent = review.content
            .replace(/\n/g, ' ')
            .replace(/\t/g, ' ')
            .replace(/\s+/g, ' ');

          // 모든 정보를 한 줄에 추가
          tsvData += `\t${review.userName}\t${review.rating}\t${review.date}\t${review.option}\t${review.quantity}\t${sanitizedContent}`;
        });
      }
      
      await navigator.clipboard.writeText(tsvData);
      
      document.getElementById('result').innerHTML = `
        <b>수집 완료!</b><br>
        상품명: ${productInfo.name}<br>
        가격: ${productInfo.price}<br>
        이미지 수: ${productInfo.imageUrls.length}개<br>
        리뷰 수: ${productInfo.reviews.length}개<br>
        <small>스프레드시트에 붙여넣기할 수 있게 클립보드에 복사되었습니다.</small><br>
        <small>이미지가 다운로드 폴더에 저장되었습니다.</small>
      `;
    } else {
      document.getElementById('result').innerHTML = `
        <div style="color: #dc3545;">정보를 찾을 수 없습니다.</div>
      `;
    }
  } catch (error) {
    console.error('전체 처리 중 오류:', error);
    document.getElementById('result').innerHTML = `
      <div style="color: #dc3545;">
        오류가 발생했습니다: ${error.message}<br>
        <small>자세한 내용은 콘솔을 확인해주세요.</small>
      </div>
    `;
  }
});

// 폴더 생성 버튼 이벤트 리스너
document.getElementById('createFolder').addEventListener('click', async () => {
  const guide = `다운로드된 파일은 자동으로 시스템의 기본 '다운로드' 폴더에 저장됩니다.`;

  const blob = new Blob([guide], { type: 'text/plain' });
  const guideUrl = URL.createObjectURL(blob);

  try {
    await chrome.downloads.download({
      url: guideUrl,
      filename: '다운로드안내.txt',
      saveAs: false
    });

    document.getElementById('result').innerHTML = `
      <div style="background-color: #f8f9fa; padding: 10px; border-radius: 4px;">
        <b>다운로드 안내문이 저장되었습니다.</b><br>
        파일은 기본 '다운로드' 폴더로 저장됩니다.<br>
        <br>
        <small style="color: #666;">* 추가 작업은 필요하지 않습니다.</small>
      </div>
    `;
  } finally {
    URL.revokeObjectURL(guideUrl);
  }
});