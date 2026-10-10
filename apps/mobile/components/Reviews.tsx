import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const colors = {
  forest: '#185A43',
  spice: '#E69B45',
  cream: '#F8EEDD',
  terracotta: '#B84F30',
  brown: '#3A2E22',
  muted: '#756C61',
};
const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export type ChefReview = {
  id: string;
  rating: number;
  reviewText: string | null;
  recommended: boolean;
  createdAt: string;
  photos: Array<{ id: string; imageUrl: string }>;
  response: { response: string; createdAt: string; updatedAt: string } | null;
};

export type ReviewSort = 'newest' | 'highest' | 'lowest';

export type ChefReviewList = {
  items: ChefReview[];
  averageRating: number | null;
  reviewCount: number;
  page: number;
  limit: number;
  total: number;
  pages: number;
};

type StarRatingInputProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
};

export function StarRatingInput({ label, value, onChange }: StarRatingInputProps) {
  return (
    <View style={styles.inputRating}>
      <Text style={styles.inputRatingLabel}>{label}</Text>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable
            key={star}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${star} star${star === 1 ? '' : 's'}`}
            accessibilityState={{ selected: value === star }}
            onPress={() => onChange(star)}
            style={styles.starButton}
          >
            <Text style={[styles.star, star <= value && styles.starSelected]}>★</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function StarRating({ rating }: { rating: number }) {
  return (
    <View style={styles.starsRow} accessibilityLabel={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Text key={star} style={[styles.star, star <= rating && styles.starSelected]}>
          ★
        </Text>
      ))}
    </View>
  );
}

export function RatingSummary({ average, count }: { average: number | null; count: number }) {
  return (
    <View style={styles.ratingSummary}>
      <Text style={styles.ratingSummaryValue}>{average?.toFixed(1) ?? 'New'}</Text>
      <StarRating rating={average ? Math.round(average) : 0} />
      <Text style={styles.ratingSummaryCount}>
        {count} verified {count === 1 ? 'review' : 'reviews'}
      </Text>
    </View>
  );
}

export function ChefResponse({ response }: { response: string }) {
  return (
    <View style={styles.chefResponse}>
      <Text style={styles.chefResponseTitle}>Chef response</Text>
      <Text style={styles.reviewText}>{response}</Text>
    </View>
  );
}

export function ReviewCard({ review }: { review: ChefReview }) {
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewCardHeader}>
        <StarRating rating={review.rating} />
        <Text style={styles.reviewDate}>
          {new Date(review.createdAt).toLocaleDateString()}
        </Text>
      </View>
      <Text style={styles.reviewRecommendation}>
        {review.recommended ? 'Recommends this chef' : 'Does not recommend this chef'}
      </Text>
      {review.reviewText ? <Text style={styles.reviewText}>{review.reviewText}</Text> : null}
      {review.photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {review.photos.map((photo) => (
            <Image
              key={photo.id}
              source={{ uri: photo.imageUrl }}
              accessibilityLabel="Customer review food photo"
              style={styles.reviewPhoto}
            />
          ))}
        </ScrollView>
      ) : null}
      {review.response ? <ChefResponse response={review.response.response} /> : null}
    </View>
  );
}

type ExistingReview = {
  id: string;
  rating: number;
  reviewText: string | null;
  recommended: boolean;
  foodQuality?: number | null;
  communication?: number | null;
  punctuality?: number | null;
  professionalism?: number | null;
  photos?: Array<{ imageUrl: string }>;
};

type ReviewFormProps = {
  bookingId: string;
  accessToken: string;
  existingReview?: ExistingReview;
  onSubmitted: () => void;
};

export function ReviewForm({
  bookingId,
  accessToken,
  existingReview,
  onSubmitted,
}: ReviewFormProps) {
  const [rating, setRating] = useState(existingReview?.rating ?? 0);
  const [reviewText, setReviewText] = useState(existingReview?.reviewText ?? '');
  const [recommended, setRecommended] = useState(existingReview?.recommended ?? true);
  const [foodQuality, setFoodQuality] = useState(existingReview?.foodQuality ?? 0);
  const [communication, setCommunication] = useState(existingReview?.communication ?? 0);
  const [punctuality, setPunctuality] = useState(existingReview?.punctuality ?? 0);
  const [professionalism, setProfessionalism] = useState(existingReview?.professionalism ?? 0);
  const [photoUrls, setPhotoUrls] = useState(
    existingReview?.photos?.map(({ imageUrl }) => imageUrl).join('\n') ?? '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  async function submitReview() {
    if (rating < 1 || rating > 5) {
      setFormError('Choose a star rating from 1 to 5.');
      return;
    }
    const photos = photoUrls.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    if (photos.length > 5 || photos.some((url) => !url.startsWith('https://'))) {
      setFormError('Add up to five HTTPS photo URLs, one URL per line.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setFormNotice(null);
    const payload = {
      ...(existingReview ? {} : { bookingId }),
      rating,
      reviewText: reviewText.trim() || undefined,
      recommended,
      ...(foodQuality ? { foodQuality } : {}),
      ...(communication ? { communication } : {}),
      ...(punctuality ? { punctuality } : {}),
      ...(professionalism ? { professionalism } : {}),
      photos,
    };

    try {
      const response = await fetch(
        `${apiBaseUrl}/reviews${existingReview ? `/${existingReview.id}` : ''}`,
        {
          method: existingReview ? 'PATCH' : 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        throw new Error(`Review ${existingReview ? 'update' : 'submission'} failed (${response.status}).`);
      }
      setFormNotice(existingReview ? 'Your review was updated.' : 'Your review was submitted.');
      onSubmitted();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not submit your review.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>
        {existingReview ? 'Edit your review' : 'Review your completed booking'}
      </Text>
      <Text style={styles.formCopy}>
        Reviews are linked to completed bookings. You can edit this review for seven days after submission.
      </Text>
      <StarRatingInput label="Overall rating" value={rating} onChange={setRating} />
      <TextInput
        accessibilityLabel="Written review"
        value={reviewText}
        onChangeText={setReviewText}
        placeholder="Share details about your experience (optional)"
        placeholderTextColor={colors.muted}
        multiline
        maxLength={3000}
        style={styles.reviewInput}
      />
      <Text style={styles.privateFeedbackLabel}>Private feedback for the chef</Text>
      <Text style={styles.formCopy}>
        These category ratings are visible to the chef, not on the public review.
      </Text>
      <StarRatingInput label="Food quality" value={foodQuality} onChange={setFoodQuality} />
      <StarRatingInput label="Communication" value={communication} onChange={setCommunication} />
      <StarRatingInput label="Punctuality" value={punctuality} onChange={setPunctuality} />
      <StarRatingInput label="Professionalism" value={professionalism} onChange={setProfessionalism} />
      <TextInput
        accessibilityLabel="Food photo HTTPS URLs"
        value={photoUrls}
        onChangeText={setPhotoUrls}
        placeholder="Food photo HTTPS URLs, one per line (optional)"
        placeholderTextColor={colors.muted}
        multiline
        style={styles.reviewInput}
      />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: recommended }}
        onPress={() => setRecommended((current) => !current)}
        style={styles.recommendRow}
      >
        <Text style={styles.recommendCheck}>{recommended ? '☑' : '□'}</Text>
        <Text style={styles.recommendText}>I recommend this chef</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isSubmitting || rating === 0 }}
        disabled={isSubmitting || rating === 0}
        onPress={() => void submitReview()}
        style={[styles.submitButton, (isSubmitting || rating === 0) && styles.submitDisabled]}
      >
        <Text style={styles.submitButtonText}>
          {isSubmitting ? 'Saving…' : existingReview ? 'Save changes' : 'Submit review'}
        </Text>
      </Pressable>
      {formError ? <Text accessibilityRole="alert" style={styles.formError}>{formError}</Text> : null}
      {formNotice ? <Text style={styles.formNotice}>{formNotice}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starButton: {
    paddingHorizontal: 3,
    paddingVertical: 3,
  },
  star: {
    color: '#D9CCBD',
    fontSize: 17,
  },
  starSelected: {
    color: colors.spice,
  },
  inputRating: {
    marginBottom: 8,
  },
  inputRatingLabel: {
    color: colors.brown,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 3,
  },
  ratingSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
    marginBottom: 4,
  },
  ratingSummaryValue: {
    color: colors.forest,
    fontSize: 18,
    fontWeight: '800',
    marginRight: 6,
  },
  ratingSummaryCount: {
    color: colors.muted,
    fontSize: 12,
    marginLeft: 6,
  },
  reviewCard: {
    backgroundColor: '#FBF8F3',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  reviewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewDate: {
    color: colors.muted,
    fontSize: 11,
  },
  reviewRecommendation: {
    color: colors.forest,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  reviewText: {
    color: colors.brown,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  reviewPhoto: {
    width: 92,
    height: 92,
    borderRadius: 10,
    marginTop: 10,
    marginRight: 8,
  },
  chefResponse: {
    backgroundColor: colors.cream,
    borderLeftWidth: 3,
    borderLeftColor: colors.spice,
    padding: 10,
    marginTop: 10,
    borderRadius: 8,
  },
  chefResponseTitle: {
    color: colors.forest,
    fontSize: 12,
    fontWeight: '800',
  },
  form: {
    backgroundColor: '#FBF8F3',
    borderRadius: 18,
    padding: 14,
  },
  formTitle: {
    color: colors.forest,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  formCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  reviewInput: {
    minHeight: 74,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#D9CCBD',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 11,
    color: colors.brown,
    fontSize: 13,
    marginBottom: 10,
  },
  privateFeedbackLabel: {
    color: colors.terracotta,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 8,
  },
  recommendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  recommendCheck: {
    color: colors.forest,
    fontSize: 20,
    marginRight: 8,
  },
  recommendText: {
    color: colors.brown,
    fontSize: 13,
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: colors.forest,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 13,
    marginTop: 4,
  },
  submitDisabled: {
    opacity: 0.45,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  formError: {
    color: colors.terracotta,
    fontSize: 12,
    marginTop: 8,
  },
  formNotice: {
    color: colors.forest,
    fontSize: 12,
    marginTop: 8,
  },
});
